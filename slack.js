async function go() {
    let rows = document.querySelectorAll(".c-virtual_list__item");
    for (let row of rows) {
        let img = row.querySelector("img.p-customize_emoji_list__image");
        console.log(img.src)
        let name_elt = row.querySelector("b.black");
        let name = name_elt.innerText.replace(/:/g, '');
        console.log(name)

        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                command: "nextFilename",
                filename: name + ".png"
            }, (response) => {
                console.log("nextFilename response", response);
                resolve();
            });
        });


        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                command: "download",
                url: img.src,
                filename: name
            }, (response) => {
                console.log("download response", response);
                resolve();
            });
        });
    }
}

go();
