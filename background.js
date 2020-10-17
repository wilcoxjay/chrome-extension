// Returns a string script that expects to run on target page.
// The returned script sets the max_width of the given selector (eg, the main container on the page).
// The max_width argument is optional and defaults to 800px.
function setMaxWidth(selector, max_width) {
    if (max_width === undefined) {
        max_width = '800px';
    }
    return `let thing = document.querySelector("${selector}");
thing.style.marginRight = 'auto';
thing.style.maxWidth = '${max_width}';`
}

// The main data structure describing what to do on various pages.
//
// An array of entries. Each entry is an object with the following fields:
//     - hostname (required): a "Matchable" (see below) describing what sites to run on
//     - path (optional): a Matchable describing which pages on the site to run on.
//       If omitted, run on every page on the site.
//     - event_source (optional): either the string 'load' or the string 'command'
//       describing whether this entry should run only on page load or only on
//       explicit command. If omitted, the entry matches all event sources.
//     - code (optional): a string containing js code to run in the target page
//     - script (optional): a filename to load js code to run in the target page
//
// Each entry should contain either a code field, or a script field. If both are
// missing, an error is logged. If both are present, 'script' silently wins.
var dispatchTable = [
    { hostname:     'en.wikipedia.org',
      path:         (path) => path.startsWith('/wiki/'),
      code:          setMaxWidth('#content')},
    { hostname:     (h) => h.endsWith('.slack.com'),
      path:         '/customize/emoji',
      script:       'slack.js',
      event_source: 'command'},
];

// Determine whether the string matches the Matchable.
//
// A Matchable m has type Union[string -> bool, string, Array[string]].
// If m is a predicate, the result is to call the predicate on the string.
// If m is a string, it is compared for equality.
// If m is an array of strings, the result is m.contains(string)
function match(matchable, string) {
    if (typeof matchable === "function") {
        let predicate = matchable;
        return predicate(string);
    } else if (typeof matchable === "string") {
        let string = matchable;
        return string === string;
    } else if (typeof matchable === "object") {
        // assume it's an array-ish thing
        let l = matchable;
        for (let x of l) {
            if (x === string) {
                return true;
            }
        }
        return false;
    } else {
        throw "bad matchable"
    }
}

// The main function to actually run stuff.
//
// Takes a tab and sees if the page displayed in that tab has an entry in the dispatch table.
// If so, performs the action specified by the table.
//
// @param event_source is either 'load' or 'command', depending on whether this dispatch
//        was initiated by the page finishing loading (ish) or from the user explicitly
//        invoking the extension via the keyboard shortcut.
function dispatch(tab, event_source) {
    console.log(tab);
    let url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) {  // weird stuff happens with the file:// protocol
        return;
    }
    // It's so common to want to handle both the www. and non-www. variant of the hostname,
    // we just normalize hostnames by stripping those characters.
    let hostname = url.hostname.replace(/^(www\.)/,"");
    console.log(hostname);

    var found = false;
    for (let entry of dispatchTable) {
        if (match(entry.hostname, hostname) &&
            (!entry.hasOwnProperty('path') || match(entry.path, url.pathname)) &&
            (!entry.hasOwnProperty('event_source') || event_source === entry.event_source)) {
            if (entry.hasOwnProperty('script')) {
                chrome.tabs.executeScript(tab.id, {
                    file: entry.script,
                    runAt: "document_end"
                });
            } else if (entry.hasOwnProperty('code')) {
                chrome.tabs.executeScript(tab.id, {
                    code: entry.code,
                    runAt: "document_end"
                });
            } else {
                throw 'expected entry ' + entry + ' to have code or script property';
            }
            found = true;
            break;
        }
    }
    if (!found) {
        console.log('no dispatch entry matching', hostname, url.pathname);
    }
}

// When the page finishes loading (ish), dispatch.
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.hasOwnProperty('status') && changeInfo.status == 'complete') {
        dispatch(tab, 'load');
    }
});


// When the user presses the keyboard shortcut, dispatch.
chrome.commands.onCommand.addListener(function(command) {
    console.log(command);
    if (command === "myCommand") {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            if (tabs.length != 1) {
                console.log(tabs);
                throw "unexpected answer from tabs.query!";
            }
            dispatch(tabs[0], 'command');
        });
    } else {
        throw ("unknown command " + command);
    }
});


////////////////////////////////////////////////////////////////////////////////
// That's the gist of it. Below here is some gnarly stuff to support more
// advanced scraping stuff like programmatically asking Chrome to download stuff.
////////////////////////////////////////////////////////////////////////////////

function doDownload(msg) {
    chrome.downloads.download({url: msg.url, filename: msg.filename}, function (dId) {
        // do nothing on success. wait for Chrome to ask us for a suggested name later.
    });
}

// Some truly bad design here. Basically, Chrome does not respect the filename field
// of the download call above. But there is another mechanism where an extension can
// "suggest" a name for a new download. So what we do is have a separate command
// where the script running in the tab first tells us "hey, I'm about to start
// a download, and I'd like it to be named <foo>". Then when Chrome asks us to
// suggest a name, we can suggest <foo> on behalf of the tab.
//
// Unfortunately, this really sucks to get right because it means we have to carefully
// synrchonize two things that Chrome thinks are completely independent: starting
// a download and naming it. So we are actually not going to respond to the tab's
// download request with an acknowledgement until we've succeeded in "suggesting"
// the filename.

// If non-null, respond to Chrome's request for a suggested filename with this,
// then set it to null. If null, then we'll tell Chrome we don't have a suggestion,
// and it will do whatever it normally does.
var nextFilename = null;

// The truly ugly part. If non-null, a callback to call after successfully suggesting
// a filename to Chrome. We use this to unblock the target tab and tell it it's ok
// to start another download request. (We can only handle one download request at a time
// because we have to wait for Chrome to ask us for name suggestions, and we only track
// one "nextFilename". Fuck me.)
var afterUsingNextFilename = null;

// The background page has to mediate access to the Chrome API for all the target tabs.
// The design here is to communicate with the tabs via the message passing API, and
// make calls on their behalf, and return results.
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    console.log(msg);
    if (msg.command === "nextFilename") {
        // Prepare for the next "download" command.
        nextFilename = msg.filename;
        console.log("received filename", nextFilename);
        sendResponse({ack: true});
    } else if (msg.command === "download") {
        // Note that we're not going to sendResponse() until we've successfully renamed the file.
        afterUsingNextFilename = () => sendResponse({ack: true});  // set the ugly callback.
        doDownload(msg);
        return true;  // returning true from addListener means "I stored your callback and will call it later"
                      // if you don't do this, it assumes you will never call it, and a bunch of bad stuff
                      //  happens if you do end up calling it.
    } else if (msg.command === "closeTab") {
        chrome.tabs.remove(sender.tab.id);
    } else if (msg.command === "makeTab") {
        chrome.tabs.create({url: msg.url, active: sender.tab.active, index: sender.tab.index + 1});
    } else if (msg.command === "focusMe") {
        console.log(sender.tab);
        chrome.tabs.update(sender.tab.id, {active: true});
    } else {
        throw ("unknown message command " + msg.command);
    }
});

// Register a "suggestor" for download filenames.
chrome.downloads.onDeterminingFilename.addListener(function (dI, suggest) {
    if (nextFilename != null) {
        suggest({filename: nextFilename});
        console.log("using filename", nextFilename);
        nextFilename = null;
        if (afterUsingNextFilename != null) {
            afterUsingNextFilename();
            afterUsingNextFilename = null;
        }
    } else {
        console.log("no nextFilename", dI);
        suggest();
    }
});
