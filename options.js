/*global document, window, gsUtils, chrome */

(function() {

    'use strict';

    var elementPrefMap = {
            'preview': gsUtils.SHOW_PREVIEW,
            'previewQuality': gsUtils.PREVIEW_QUALITY,
            'onlineCheck': gsUtils.ONLINE_CHECK,
            'unsuspendOnFocus': gsUtils.UNSUSPEND_ON_FOCUS,
            'dontSuspendPinned': gsUtils.IGNORE_PINNED,
            'dontSuspendForms': gsUtils.IGNORE_FORMS,
            'ignoreCache': gsUtils.IGNORE_CACHE,
            'timeToSuspend': gsUtils.SUSPEND_TIME,
            'whitelist': gsUtils.WHITELIST,
            'tidyUrls' : gsUtils.TIDY_URLS
        },
        elementIdMap = invert(elementPrefMap);

    function invert(obj) {

        var new_obj = {};
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
               new_obj[obj[prop]] = prop;
            }
        }
        return new_obj;
    };

    function selectComboBox(element, key) {
        var i,
            child;

        for (i = 0; i < element.children.length; i++) {
            child = element.children[i];
            if (child.value === key) {
                child.selected = 'true';
                break;
            }
        }
    }

    //populate settings from synced storage
    function init() {

        var optionEls = document.getElementsByClassName('option'),
            pref,
            element,
            i;

        for (i = 0; i < optionEls.length; i++) {
            element = optionEls[i];
            pref = elementPrefMap[element.id];
            populateOption(element, gsUtils.getOption(pref));
        }

        setPreviewQualityVisibility(gsUtils.getOption(gsUtils.SHOW_PREVIEW));
        setTidyUrlVisibility(gsUtils.getOption(gsUtils.TIDY_URLS));
        setOnlineCheckVisibility(gsUtils.getOption(gsUtils.SUSPEND_TIME) > 0);
    }

    function populateOption(element, value) {

        if (element.tagName === 'INPUT' && element.hasAttribute('type') && element.getAttribute('type') === 'checkbox') {
            element.checked = value;

        } else if (element.tagName === 'SELECT') {
            selectComboBox(element, value);

        } else if (element.tagName === 'TEXTAREA') {
            element.value = value;
        }
    }

    function getOptionValue(element) {

        if (element.tagName === 'INPUT' && element.hasAttribute('type') && element.getAttribute('type') === 'checkbox') {
            return element.checked;

        } else if (element.tagName === 'SELECT') {
            return element.children[element.selectedIndex].value;

        } else if (element.tagName === 'TEXTAREA') {
            return element.value;
        }
    }

    function setPreviewQualityVisibility(visible) {
        if (visible) {
            document.getElementById('previewQualitySection').style.display = 'block';
            document.getElementById('previewQualityNote').style.display = 'block';
        } else {
            document.getElementById('previewQualitySection').style.display = 'none';
            document.getElementById('previewQualityNote').style.display = 'none';
        }
    }

    function setTidyUrlVisibility(visible) {
        if (visible) {
            document.getElementById('tidyUrlsNote').style.display = 'block';
        } else {
            document.getElementById('tidyUrlsNote').style.display = 'none';
        }
    }

    function setOnlineCheckVisibility(visible) {
        if (visible) {
            document.getElementById('onlineCheckSection').style.display = 'block';
        } else {
            document.getElementById('onlineCheckSection').style.display = 'none';
        }
    }

    function getHandler(element) {

        return function() {

            var pref = elementPrefMap[element.id];
            gsUtils.setOption(elementPrefMap[element.id], getOptionValue(element));

            //add specific screen element listeners
            if (pref === gsUtils.SHOW_PREVIEW) {
                setPreviewQualityVisibility(getOptionValue(element));

            } else if (pref === gsUtils.TIDY_URLS) {
                setTidyUrlVisibility(getOptionValue(element));

            } else if (pref === gsUtils.SUSPEND_TIME) {
                var interval = getOptionValue(element);
                setOnlineCheckVisibility(interval > 0);
                if (interval > 0) resetTabTimers(interval);
            }
        }
    }

    var readyStateCheckInterval = window.setInterval(function() {
        if (document.readyState === 'complete') {

            window.clearInterval(readyStateCheckInterval);

            init();


            var optionEls = document.getElementsByClassName('option'),
                showHistoryEl = document.getElementById('showHistory'),
                clearHistoryEl = document.getElementById('clearHistory'),
                cleanupWhitelistEl = document.getElementById('cleanupWhitelist'),
                element,
                i;

            //add change listeners for all 'option' elements
            for (i = 0; i < optionEls.length; i++) {
                element = optionEls[i];
                element.onchange = getHandler(element);
            }

            showHistoryEl.onclick = function(e) {
                chrome.tabs.create({url: chrome.extension.getURL('history.html')});
            };
            clearHistoryEl.onclick = function(e) {
                gsUtils.clearGsSessionHistory();
                gsUtils.clearGsHistory();
                gsUtils.clearPreviews();
            };
            cleanupWhitelistEl.onclick = function(e) {
                var whitelist = gsUtils.getOption(gsUtils.WHITELIST),
                    whitelistedWords = whitelist ? whitelist.split(/[\s\n]+/).sort() : '',
                    whitelistEl = document.getElementById('whitelist'),
                    i,
                    j,
                    ii = whitelistedWords.length;

                for (i = 0; i < ii; i++)
                    if ((j = whitelistedWords.lastIndexOf(whitelistedWords[i])) !== i)
                        whitelistedWords.splice(i+1, j-i);

                whitelistEl.value = whitelistedWords.join('\n');
                whitelistEl.onchange();
            };

            chrome.storage.onChanged.addListener(function(changes, namespace) {
                var property,
                    elementId,
                    element;

                if (namespace !== 'sync') return;
                for (property in changes) {
                    if (changes.hasOwnProperty(property)) {

                        elementId = elementIdMap[property];
                        element = document.getElementById(elementId);
                        populateOption(element, changes[property].newValue);
                    }
                }
            });
        }
    }, 50);


    //TODO: add a pref save button

    function resetTabTimers(newInterval) {

        chrome.tabs.query({}, function(tabs) {
            var i,
                currentTab,
                timeout = newInterval * 60 * 1000;

            for (i = 0; i < tabs.length; i++) {
                currentTab = tabs[i];

                (function() {
                    var tabId = currentTab.id;

                    //test if a content script is active by sending a 'requestInfo' message
                    chrome.tabs.sendMessage(tabId, {action: 'requestInfo'}, function(response) {

                        //if no response, then try to dynamically load in the new contentscript.js file
                        if (typeof(response) !== 'undefined') {
                            chrome.tabs.sendMessage(tabId, {action: 'resetTimer', timeout: timeout});
                        }
                    });
                })();
            }
        });

    }

}());
