# My extension

A simple Chrome extension to let you write custom scripts to modify or
interact with the pages you visit.

## Installation

- Before doing anything else, open a wikipedia page, such as
  [https://en.wikipedia.org/wiki/Polyrhythm](https://en.wikipedia.org/wiki/Polyrhythm)
  for testing purposes. If you have a wide monitor, notice how the
  body text spawls all the way across and is thus (IMO) hard to read.

- Go to `about:extensions`.
- In the top left corner, click the hamburger, and ensure "Extensions" is selected.
- In the top right corner, enable "Developer mode".
- In the top left corner, click "Load unpacked". And select this directory.
- You should see an entry in the main grid on the page now with "My Extension 1.0".
- Ensure that the word "Errors" does not appear in red inside that grid box.
- In the top left corner, click the hamburger, and go to "Keyboard Shortcuts".
  Find "My Extension" and select a shortcut for the command "Invoke...". (I use Cmd-j.)

- Go back to that wikipedia page, and refresh. If the extension is working, you
  should see the margins of the content change, and the text become much
  narrower and more readable.

- As another test, go to `https://YOURWORKSPACE.slack.com/customize/emoji` and
  enter a substring that causes it to display more than one but not more than,
  say, three emoji. Then press your selected keyboard shortcut. The extension
  should auto-download all the displayed emoji with filenames corresponding to
  the emoji names.

## Adding actions to the extension

- Edit the `dispatchTable` in `background.js` according to the comments there.
  You can put script code as a string in the table directly, or you can
  give it a filename and put your code for the new site in that file.
- Go to `about:extensions`.
- In the grid for "My Extension" click the little refresh icon to reload the
  extension from disk.
- Go to the corresponding site and test your code.
- Pro tip: if you put your code in a separate file, then after your first edit
  to `background.js`, you don't need to reload the extension every time. The
  extension fetches the site-specific scripts from disk on every
  invocation. Only when you edit `background.js` to you need to reload. (You're
  gonna forget to reload.)
