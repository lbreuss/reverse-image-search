'use strict';

if (!HTMLCanvasElement.prototype.toBlob) {
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: function(callback, type, quality) {
      const binStr = atob(this.toDataURL(type, quality).split(',')[1]);
      const len = binStr.length;
      const arr = new Uint8Array(len);

      for (let i = 0; i < len; i++) {
        arr[i] = binStr.charCodeAt(i);
      }

      callback(new Blob([arr], {type: type || 'image/png'}));
    }
  });
}

function onStart() {
  chrome.contextMenus.create({
    'id': 'search-link-google',
    'type': 'normal',
    'title': 'Google Images (Image URL)',
    'contexts': ['image']
  });
  chrome.contextMenus.create({
    'id': 'search-link-tineye',
    'type': 'normal',
    'title': 'Tineye (Image URL)',
    'contexts': ['image']
  });
  chrome.contextMenus.create({
    'id': 'capture-google',
    'type': 'normal',
    'title': 'Google Images (Capture)',
    'contexts': ['page']
  });
  // chrome.contextMenus.create({
  //   'id': 'capture-tineye',
  //   'type': 'normal',
  //   'title': 'TinEye (Capture)',
  //   'contexts': ['page']
  // });
}
chrome.runtime.onInstalled.addListener(onStart);
chrome.runtime.onStartup.addListener(onStart);

function notify(id, msg) {
  chrome.tabs.insertCSS(id, {
    file: 'data/inject/notify.css'
  }, () => {
    chrome.tabs.executeScript(id, {
      file: 'data/inject/notify.js'
    }, () => {
      chrome.tabs.executeScript(id, {
        code: msg ? `notify.display('${msg}');` : `notify.hide();`
      });
    });
  });
}

const onClick = (info, tab) => {
  if (info.menuItemId.startsWith('capture-')) {
    chrome.tabs.insertCSS(tab.id, {
      file: 'data/inject/inject.css'
    }, () => {
      chrome.tabs.executeScript(tab.id, {
        code: `window.service = '${info.menuItemId.endsWith('tineye') ? 'TinEye' : 'Google'}';`
      }, () => {
        chrome.tabs.executeScript(tab.id, {
          file: 'data/inject/inject.js'
        });
      });
    });
  }
  else if (info.menuItemId.startsWith('search-link-')) {
    const tineye = info.menuItemId.endsWith('tineye');

    if (tineye) {
      chrome.tabs.create({
        url: 'https://tineye.com/search/?pluginver=chrome-1.3.0&url=' + encodeURIComponent(info.srcUrl)
      });
    }
    else {
      chrome.tabs.create({
        url: 'https://www.google.com/searchbyimage?image_url=' + encodeURIComponent(info.srcUrl)
      });
    }
  }
};

chrome.contextMenus.onClicked.addListener(onClick);
chrome.browserAction.onClicked.addListener(tab => {
  onClick({
    menuItemId: 'capture-google'
  }, tab);
});

function capture(request, sender) {
  const {devicePixelRatio, service = 'TinEye'} = request;

  let {left, top, width, height} = request;
  left *= devicePixelRatio;
  top *= devicePixelRatio;
  width *= devicePixelRatio;
  height *= devicePixelRatio;

  notify(sender.tab.id, `Uploading image to ${service}. Please wait ...`);

  chrome.tabs.captureVisibleTab(sender.tab.windowId, {format: 'png'}, dataUrl => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = width || img.width;
      canvas.height = height || img.height;
      if (width && height) {
        ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
      }
      else {
        ctx.drawImage(img, 0, 0);
      }
      canvas.toBlob(blob => {
        const formData = new window.FormData();
        formData.processData = false;
        formData.contentType = false;
        if (service === 'Google') {
          formData.append('encoded_image', blob, 'screenshot.png');
        }
        else {
          formData.append('image', blob, 'screenshot.png');
        }

        const req = new window.XMLHttpRequest();

        req.onload = () => {
          chrome.tabs.create({
            url: req.responseURL
          });
          notify(sender.tab.id);
        };
        req.onerror = e => notify(sender.tab.id, 'Failed! ' + (e.message || e));
        if (service === 'Google') {
          req.open('POST', 'https://www.google.com/searchbyimage/upload', true);
        }
        else {
          req.open('POST', 'https://tineye.com/result_json/?token=', true);
        }
        req.send(formData);
      });
    };
    img.src = dataUrl;
  });
}

chrome.runtime.onMessage.addListener(capture);

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install'
            });
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
