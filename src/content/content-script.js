// Content Script - Injected into web pages for link extraction and page capture

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractLinks') {
    const links = extractLinks();
    sendResponse({ links });
  } else if (message.action === 'getPageInfo') {
    sendResponse({
      url: window.location.href,
      title: document.title,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight
    });
  } else if (message.action === 'scrollTo') {
    window.scrollTo(0, message.y);
    sendResponse({ success: true });
  }
  return true;
});

// Extract all links from the current page, grouped by parent context
function extractLinks() {
  const links = document.querySelectorAll('a[href]');
  const seen = new Set();
  const currentDomain = window.location.hostname;
  const groups = new Map(); // groupId -> { name, links[] }

  links.forEach(link => {
    try {
      const href = link.href;
      if (!href || seen.has(href)) return;

      // Filter criteria
      if (!href.startsWith('http')) return;
      if (href.includes('#') && new URL(href).pathname === window.location.pathname) return;
      if (href.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|exe|dmg|mp3|mp4|wav|webp|ico)$/i)) return;
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

  // Convert to array format
  return Array.from(groups.entries()).map(([id, data]) => ({
    groupId: id,
    groupName: data.name,
    links: data.links
  }));
}

// Find the parent group for a link (heading, section, nav, etc.)
function findParentGroup(element) {
  let current = element.parentElement;
  const sectionTags = ['SECTION', 'ARTICLE', 'NAV', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER'];

  while (current && current !== document.body) {
    // Check for heading siblings or within a section with heading
    const heading = findNearestHeading(current);
    if (heading) {
      const headingText = heading.textContent.trim().substring(0, 50);
      return { id: `heading-${headingText}`, name: headingText };
    }

    // Check for semantic section elements
    if (sectionTags.includes(current.tagName)) {
      // Try to find a heading within this section
      const sectionHeading = current.querySelector('h1, h2, h3, h4, h5, h6');
      if (sectionHeading) {
        const text = sectionHeading.textContent.trim().substring(0, 50);
        return { id: `section-${text}`, name: text };
      }
      // Use tag name + aria-label or id
      const label = current.getAttribute('aria-label') ||
                    current.getAttribute('id') ||
                    current.tagName.toLowerCase();
      return { id: `${current.tagName}-${label}`, name: formatLabel(label) };
    }

    // Check for nav or list containers with identifiable names
    if (current.tagName === 'UL' || current.tagName === 'OL') {
      const listParent = current.parentElement;
      if (listParent) {
        // Check for preceding heading
        const prevSibling = listParent.previousElementSibling;
        if (prevSibling && /^H[1-6]$/.test(prevSibling.tagName)) {
          const text = prevSibling.textContent.trim().substring(0, 50);
          return { id: `list-${text}`, name: text };
        }
        // Check parent's id/class
        const parentId = listParent.getAttribute('id') || listParent.className.split(' ')[0];
        if (parentId && parentId.length > 2) {
          return { id: `list-${parentId}`, name: formatLabel(parentId) };
        }
      }
    }

    // Check for divs with meaningful id or class
    if (current.tagName === 'DIV') {
      const id = current.getAttribute('id');
      const className = current.className.split(' ')[0];
      const meaningful = id || className;
      if (meaningful && meaningful.length > 2 && !meaningful.match(/^(container|wrapper|inner|outer|col|row)$/i)) {
        return { id: `div-${meaningful}`, name: formatLabel(meaningful) };
      }
    }

    current = current.parentElement;
  }

  return { id: 'ungrouped', name: 'Other Links' };
}

// Find nearest heading (either sibling or ancestor's child)
function findNearestHeading(element) {
  // Check previous siblings for headings
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (/^H[1-6]$/.test(sibling.tagName)) {
      return sibling;
    }
    sibling = sibling.previousElementSibling;
  }
  return null;
}

// Format a CSS class/id into readable text
function formatLabel(str) {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}
