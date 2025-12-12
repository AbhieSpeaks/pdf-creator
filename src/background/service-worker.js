// Service Worker - Central orchestration for the PDF Creator extension

// Track offscreen document state
let creatingOffscreen = null;

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu items
  chrome.contextMenus.create({
    id: 'create-pdf-current',
    title: 'Create PDF from this page',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'create-pdf-with-links',
    title: 'Create PDF with linked pages...',
    contexts: ['page']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'create-pdf-current') {
    await createPDFFromCurrentPage(tab);
  } else if (info.menuItemId === 'create-pdf-with-links') {
    // Open popup for link selection
    chrome.action.openPopup();
  }
});

// Message handler for communication between components
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'getLinks':
      return await extractLinksFromTab(message.tabId);

    case 'captureTab':
      return await captureTab(message.tabId);

    case 'captureFullPage':
      return await captureFullPage(message.tabId);

    case 'createPDF':
      return await createPDF(message.pages, message.settings);

    case 'loadPageAndCapture':
      return await loadPageAndCapture(message.url);

    default:
      return { error: 'Unknown action' };
  }
}

// Extract links from a tab using content script
async function extractLinksFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractLinksFromDOM
    });
    return { links: results[0]?.result || [] };
  } catch (error) {
    return { error: error.message };
  }
}

// Function injected into page to extract links (grouped by parent context)
function extractLinksFromDOM() {
  const links = document.querySelectorAll('a[href]');
  const seen = new Set();
  const currentDomain = window.location.hostname;
  const groups = new Map();

  // Helper: Find parent group for a link
  function findParentGroup(element) {
    let current = element.parentElement;
    const sectionTags = ['SECTION', 'ARTICLE', 'NAV', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER'];

    while (current && current !== document.body) {
      // Check for heading siblings
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (/^H[1-6]$/.test(sibling.tagName)) {
          const text = sibling.textContent.trim().substring(0, 50);
          return { id: `heading-${text}`, name: text };
        }
        sibling = sibling.previousElementSibling;
      }

      // Check for semantic section elements
      if (sectionTags.includes(current.tagName)) {
        const sectionHeading = current.querySelector('h1, h2, h3, h4, h5, h6');
        if (sectionHeading) {
          const text = sectionHeading.textContent.trim().substring(0, 50);
          return { id: `section-${text}`, name: text };
        }
        const label = current.getAttribute('aria-label') ||
                      current.getAttribute('id') ||
                      current.tagName.toLowerCase();
        return { id: `${current.tagName}-${label}`, name: formatLabel(label) };
      }

      // Check for list containers
      if (current.tagName === 'UL' || current.tagName === 'OL') {
        const listParent = current.parentElement;
        if (listParent) {
          const prevSibling = listParent.previousElementSibling;
          if (prevSibling && /^H[1-6]$/.test(prevSibling.tagName)) {
            const text = prevSibling.textContent.trim().substring(0, 50);
            return { id: `list-${text}`, name: text };
          }
          const parentId = listParent.getAttribute('id') || (listParent.className || '').split(' ')[0];
          if (parentId && parentId.length > 2) {
            return { id: `list-${parentId}`, name: formatLabel(parentId) };
          }
        }
      }

      // Check for divs with meaningful id/class
      if (current.tagName === 'DIV') {
        const id = current.getAttribute('id');
        const className = (current.className || '').split(' ')[0];
        const meaningful = id || className;
        if (meaningful && meaningful.length > 2 && !meaningful.match(/^(container|wrapper|inner|outer|col|row)$/i)) {
          return { id: `div-${meaningful}`, name: formatLabel(meaningful) };
        }
      }

      current = current.parentElement;
    }
    return { id: 'ungrouped', name: 'Other Links' };
  }

  // Helper: Format CSS class/id into readable text
  function formatLabel(str) {
    return str
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  }

  links.forEach(link => {
    try {
      const href = link.href;
      if (!href || seen.has(href)) return;

      if (!href.startsWith('http')) return;
      if (href.includes('#') && new URL(href).pathname === window.location.pathname) return;
      if (href.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|exe|dmg|mp3|mp4|wav)$/i)) return;
      if (href.includes('javascript:')) return;

      seen.add(href);

      const url = new URL(href);
      const text = (link.textContent || link.innerText || '').trim();
      const group = findParentGroup(link);

      if (!groups.has(group.id)) {
        groups.set(group.id, { name: group.name, links: [] });
      }

      groups.get(group.id).links.push({
        url: href,
        text: text.substring(0, 100) || url.pathname || href,
        sameDomain: url.hostname === currentDomain
      });
    } catch (e) {
      // Invalid URL, skip
    }
  });

  return Array.from(groups.entries()).map(([id, data]) => ({
    groupId: id,
    groupName: data.name,
    links: data.links
  }));
}

// Capture visible tab as screenshot
async function captureTab(tabId) {
  try {
    // Ensure tab is active
    await chrome.tabs.update(tabId, { active: true });
    await new Promise(r => setTimeout(r, 300));

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });

    return { dataUrl };
  } catch (error) {
    return { error: error.message };
  }
}

// Capture full page by scrolling
async function captureFullPage(tabId) {
  try {
    // Get page dimensions
    const [{ result: dimensions }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      })
    });

    const captures = [];
    const { scrollHeight, clientHeight } = dimensions;

    console.log('Service Worker: Capturing page', { scrollHeight, clientHeight, sections: Math.ceil(scrollHeight / clientHeight) });

    // Scroll and capture with rate limiting
    // Chrome limits captureVisibleTab to ~2 calls/second
    const CAPTURE_DELAY = 600; // ms between captures to stay under rate limit

    for (let y = 0; y < scrollHeight; y += clientHeight) {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (scrollY) => window.scrollTo(0, scrollY),
        args: [y]
      });

      // Wait for scroll to settle and respect rate limit
      await new Promise(r => setTimeout(r, CAPTURE_DELAY));

      // Capture with retry on rate limit error
      let dataUrl;
      let retries = 3;
      while (retries > 0) {
        try {
          dataUrl = await chrome.tabs.captureVisibleTab(null, {
            format: 'png',
            quality: 100
          });
          break; // Success, exit retry loop
        } catch (captureError) {
          if (captureError.message.includes('MAX_CAPTURE') && retries > 1) {
            console.warn('Service Worker: Rate limit hit, waiting before retry...');
            await new Promise(r => setTimeout(r, 1000)); // Wait 1 second before retry
            retries--;
          } else {
            throw captureError;
          }
        }
      }

      captures.push({
        dataUrl,
        y,
        height: Math.min(clientHeight, scrollHeight - y)
      });

      console.log('Service Worker: Captured section', captures.length);
    }

    // Reset scroll position
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.scrollTo(0, 0)
    });

    return { captures, dimensions };
  } catch (error) {
    return { error: error.message };
  }
}

// Load a URL in background tab and capture it
async function loadPageAndCapture(url) {
  let tab = null;
  try {
    // Create background tab
    tab = await chrome.tabs.create({ url, active: false });

    // Wait for page to load
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Page load timeout'));
      }, 30000);

      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // Additional wait for rendering
    await new Promise(r => setTimeout(r, 1000));

    // Capture the tab
    const result = await captureFullPage(tab.id);

    return result;
  } catch (error) {
    return { error: error.message };
  } finally {
    if (tab) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {
        // Tab may already be closed
      }
    }
  }
}

// Create PDF from current page only (context menu action)
async function createPDFFromCurrentPage(tab) {
  try {
    console.log('Service Worker: Creating PDF from current page');

    const captureResult = await captureFullPage(tab.id);
    if (captureResult.error) {
      throw new Error(captureResult.error);
    }

    await ensureOffscreenDocument();

    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'generatePDF',
      pages: [{
        url: tab.url,
        title: tab.title,
        captures: captureResult.captures,
        dimensions: captureResult.dimensions
      }],
      settings: { pageSize: 'a4', orientation: 'portrait' }
    });

    // Close offscreen document after use
    await closeOffscreenDocument();

    if (response.error) {
      throw new Error(response.error);
    }

    // Download the PDF
    await chrome.downloads.download({
      url: response.dataUrl,
      filename: sanitizeFilename(tab.title) + '.pdf',
      saveAs: true
    });

    console.log('Service Worker: PDF download started');

  } catch (error) {
    console.error('Error creating PDF:', error);
    await closeOffscreenDocument().catch(() => {});
  }
}

// Create PDF with multiple pages
async function createPDF(pages, settings) {
  try {
    console.log('Service Worker: Creating PDF with', pages.length, 'pages');

    await ensureOffscreenDocument();
    console.log('Service Worker: Offscreen document ready');

    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'generatePDF',
      pages,
      settings
    });

    console.log('Service Worker: PDF generation response received');

    // Close offscreen document after use to free quota
    await closeOffscreenDocument();

    return response;
  } catch (error) {
    console.error('Service Worker: Error in createPDF:', error);
    // Try to close offscreen document on error too
    await closeOffscreenDocument().catch(() => {});
    return { error: error.message };
  }
}

// Close offscreen document to free quota
async function closeOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
      console.log('Service Worker: Offscreen document closed');
    }
  } catch (error) {
    console.warn('Service Worker: Error closing offscreen document:', error);
  }
}

// Ensure offscreen document exists
async function ensureOffscreenDocument() {
  // First check if one already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    console.log('Service Worker: Offscreen document already exists');
    return;
  }

  // Wait if one is being created
  if (creatingOffscreen) {
    console.log('Service Worker: Waiting for offscreen document creation');
    await creatingOffscreen;
    return;
  }

  // Create new offscreen document
  console.log('Service Worker: Creating offscreen document');
  try {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Generate PDF from captured page images'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
    console.log('Service Worker: Offscreen document created');
  } catch (error) {
    creatingOffscreen = null;
    console.error('Service Worker: Failed to create offscreen document:', error);

    // If quota exceeded, try closing any existing and retry
    if (error.message.includes('quota') || error.message.includes('limit')) {
      console.log('Service Worker: Quota issue, attempting to close and retry');
      await closeOffscreenDocument();

      // Retry once
      creatingOffscreen = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['BLOBS'],
        justification: 'Generate PDF from captured page images'
      });
      await creatingOffscreen;
      creatingOffscreen = null;
      console.log('Service Worker: Offscreen document created on retry');
    } else {
      throw error;
    }
  }
}

// Sanitize filename
function sanitizeFilename(name) {
  return (name || 'webpage')
    .replace(/[<>:"/\\|?*]/g, '')
    .substring(0, 100);
}
