// Popup UI Logic

let currentTab = null;
let allGroups = []; // Array of { groupId, groupName, links[] }

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Display current page info
  document.getElementById('current-page-title').textContent = tab.title || tab.url;

  // Set default filename based on page title
  const defaultFilename = sanitizeFilename(tab.title || 'webpage');
  document.getElementById('filename-input').value = defaultFilename;

  // Load links from the page
  await loadLinks();

  // Set up event listeners
  setupEventListeners();
});

// Load links from current page
async function loadLinks() {
  const linksList = document.getElementById('links-list');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getLinks',
      tabId: currentTab.id
    });

    if (response.error) {
      linksList.innerHTML = '<div class="empty">Error loading links</div>';
      return;
    }

    allGroups = response.links || [];
    renderGroupedLinks(allGroups);
  } catch (error) {
    linksList.innerHTML = '<div class="empty">Error loading links</div>';
  }
}

// Render grouped links
function renderGroupedLinks(groups) {
  const linksList = document.getElementById('links-list');
  const linkCount = document.getElementById('link-count');

  // Count total links
  const totalLinks = groups.reduce((sum, g) => sum + g.links.length, 0);
  linkCount.textContent = `(${totalLinks} links in ${groups.length} groups)`;

  if (groups.length === 0 || totalLinks === 0) {
    linksList.innerHTML = '<div class="empty">No links found on this page</div>';
    return;
  }

  linksList.innerHTML = groups.map((group, groupIndex) => `
    <div class="link-group" data-group-id="${escapeHtml(group.groupId)}">
      <div class="group-header">
        <label class="group-checkbox">
          <input type="checkbox" class="group-select" data-group-index="${groupIndex}">
          <span class="group-name">${escapeHtml(group.groupName)}</span>
          <span class="group-count">(${group.links.length})</span>
        </label>
        <button class="toggle-group" data-group-index="${groupIndex}" title="Expand/Collapse">
          <span class="toggle-icon">▼</span>
        </button>
      </div>
      <div class="group-links expanded">
        ${group.links.map((link, linkIndex) => `
          <label class="link-item ${link.sameDomain ? 'same-domain' : ''}" data-group="${groupIndex}" data-index="${linkIndex}">
            <input type="checkbox" class="link-checkbox" data-url="${escapeHtml(link.url)}" data-group-index="${groupIndex}">
            <div class="link-info">
              <span class="link-text">${escapeHtml(link.text)}</span>
              <span class="link-url">${escapeHtml(link.url)}</span>
            </div>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Set up group toggle and checkbox handlers
  setupGroupHandlers();
}

// Set up handlers for group interactions
function setupGroupHandlers() {
  // Toggle group expand/collapse
  document.querySelectorAll('.toggle-group').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const groupIndex = btn.dataset.groupIndex;
      const group = btn.closest('.link-group');
      const linksContainer = group.querySelector('.group-links');
      const icon = btn.querySelector('.toggle-icon');

      linksContainer.classList.toggle('expanded');
      linksContainer.classList.toggle('collapsed');
      icon.textContent = linksContainer.classList.contains('collapsed') ? '▶' : '▼';
    });
  });

  // Group checkbox selects/deselects all links in group
  document.querySelectorAll('.group-select').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const groupIndex = checkbox.dataset.groupIndex;
      const isChecked = checkbox.checked;
      document.querySelectorAll(`.link-checkbox[data-group-index="${groupIndex}"]`).forEach(cb => {
        if (!cb.closest('.link-item').classList.contains('hidden')) {
          cb.checked = isChecked;
        }
      });
    });
  });

  // Individual link checkbox updates group checkbox state
  document.querySelectorAll('.link-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      updateGroupCheckboxState(checkbox.dataset.groupIndex);
    });
  });
}

// Update group checkbox based on individual links
function updateGroupCheckboxState(groupIndex) {
  const groupCheckbox = document.querySelector(`.group-select[data-group-index="${groupIndex}"]`);
  const linkCheckboxes = document.querySelectorAll(`.link-checkbox[data-group-index="${groupIndex}"]`);
  const visibleCheckboxes = Array.from(linkCheckboxes).filter(cb => !cb.closest('.link-item').classList.contains('hidden'));

  if (visibleCheckboxes.length === 0) {
    groupCheckbox.checked = false;
    groupCheckbox.indeterminate = false;
    return;
  }

  const checkedCount = visibleCheckboxes.filter(cb => cb.checked).length;

  if (checkedCount === 0) {
    groupCheckbox.checked = false;
    groupCheckbox.indeterminate = false;
  } else if (checkedCount === visibleCheckboxes.length) {
    groupCheckbox.checked = true;
    groupCheckbox.indeterminate = false;
  } else {
    groupCheckbox.checked = false;
    groupCheckbox.indeterminate = true;
  }
}

// Set up event listeners
function setupEventListeners() {
  // Select all button
  document.getElementById('select-all').addEventListener('click', () => {
    document.querySelectorAll('.link-checkbox').forEach(cb => {
      if (!cb.closest('.link-item').classList.contains('hidden')) {
        cb.checked = true;
      }
    });
    document.querySelectorAll('.group-select').forEach(cb => {
      cb.checked = true;
      cb.indeterminate = false;
    });
  });

  // Select none button
  document.getElementById('select-none').addEventListener('click', () => {
    document.querySelectorAll('.link-checkbox').forEach(cb => {
      cb.checked = false;
    });
    document.querySelectorAll('.group-select').forEach(cb => {
      cb.checked = false;
      cb.indeterminate = false;
    });
  });

  // Same domain button
  document.getElementById('select-same-domain').addEventListener('click', () => {
    document.querySelectorAll('.link-checkbox').forEach(cb => {
      const isSameDomain = cb.closest('.link-item').classList.contains('same-domain');
      const isVisible = !cb.closest('.link-item').classList.contains('hidden');
      cb.checked = isSameDomain && isVisible;
    });
    // Update all group checkboxes
    document.querySelectorAll('.group-select').forEach(cb => {
      updateGroupCheckboxState(cb.dataset.groupIndex);
    });
  });

  // Filter input
  document.getElementById('filter-input').addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();

    document.querySelectorAll('.link-group').forEach(group => {
      let visibleCount = 0;

      group.querySelectorAll('.link-item').forEach(item => {
        const text = item.querySelector('.link-text').textContent.toLowerCase();
        const url = item.querySelector('.link-url').textContent.toLowerCase();
        const visible = text.includes(filter) || url.includes(filter);
        item.classList.toggle('hidden', !visible);
        if (visible) visibleCount++;
      });

      // Hide empty groups
      group.classList.toggle('hidden', visibleCount === 0);

      // Update group count
      const countSpan = group.querySelector('.group-count');
      if (countSpan) {
        const totalInGroup = group.querySelectorAll('.link-item').length;
        countSpan.textContent = filter ? `(${visibleCount}/${totalInGroup})` : `(${totalInGroup})`;
      }
    });

    // Update all group checkbox states
    document.querySelectorAll('.group-select').forEach(cb => {
      updateGroupCheckboxState(cb.dataset.groupIndex);
    });
  });

  // Expand all groups
  document.getElementById('expand-all')?.addEventListener('click', () => {
    document.querySelectorAll('.group-links').forEach(el => {
      el.classList.add('expanded');
      el.classList.remove('collapsed');
    });
    document.querySelectorAll('.toggle-icon').forEach(el => {
      el.textContent = '▼';
    });
  });

  // Collapse all groups
  document.getElementById('collapse-all')?.addEventListener('click', () => {
    document.querySelectorAll('.group-links').forEach(el => {
      el.classList.remove('expanded');
      el.classList.add('collapsed');
    });
    document.querySelectorAll('.toggle-icon').forEach(el => {
      el.textContent = '▶';
    });
  });

  // Create PDF button
  document.getElementById('create-pdf').addEventListener('click', createPDF);

  // Error dismiss button
  document.getElementById('error-dismiss').addEventListener('click', hideError);
}

// Show error message (persists until dismissed)
function showError(message) {
  const errorContainer = document.getElementById('error-container');
  const errorText = document.getElementById('error-text');
  errorText.textContent = message;
  errorContainer.classList.remove('hidden');
}

// Hide error message
function hideError() {
  document.getElementById('error-container').classList.add('hidden');
}

// Create PDF
async function createPDF() {
  const btn = document.getElementById('create-pdf');
  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  // Get selected options
  const includeCurrent = document.getElementById('include-current').checked;
  const selectedLinks = Array.from(document.querySelectorAll('.link-checkbox:checked'))
    .map(cb => cb.dataset.url);

  if (!includeCurrent && selectedLinks.length === 0) {
    alert('Please select at least one page to include in the PDF');
    return;
  }

  // Get filename from input
  let filename = document.getElementById('filename-input').value.trim();
  if (!filename) {
    filename = sanitizeFilename(currentTab.title || 'webpage');
  }
  filename = sanitizeFilename(filename) + '.pdf';

  // Get settings
  const settings = {
    pageSize: document.getElementById('page-size').value,
    orientation: document.getElementById('orientation').value
  };

  console.log('Starting PDF creation:', { includeCurrent, selectedLinks: selectedLinks.length, filename, settings });

  // Hide any previous errors and disable button
  hideError();
  btn.disabled = true;
  progressContainer.classList.remove('hidden');
  progressFill.style.width = '0%';

  const pages = [];
  const totalPages = (includeCurrent ? 1 : 0) + selectedLinks.length;
  let processedPages = 0;

  try {
    // Capture current page if selected
    if (includeCurrent) {
      progressText.textContent = 'Capturing current page...';
      console.log('Capturing current page:', currentTab.url);

      const result = await chrome.runtime.sendMessage({
        action: 'captureFullPage',
        tabId: currentTab.id
      });

      console.log('Capture result:', result.error || `${result.captures?.length} captures`);

      if (result.error) {
        throw new Error('Failed to capture current page: ' + result.error);
      }

      pages.push({
        url: currentTab.url,
        title: currentTab.title,
        captures: result.captures,
        dimensions: result.dimensions
      });

      processedPages++;
      progressFill.style.width = `${(processedPages / totalPages) * 100}%`;
    }

    // Capture selected linked pages
    for (let i = 0; i < selectedLinks.length; i++) {
      const url = selectedLinks[i];
      progressText.textContent = `Capturing page ${processedPages + 1} of ${totalPages}...`;
      console.log('Capturing linked page:', url);

      const result = await chrome.runtime.sendMessage({
        action: 'loadPageAndCapture',
        url
      });

      if (result.error) {
        console.warn(`Failed to capture ${url}:`, result.error);
        // Continue with other pages
      } else {
        console.log('Linked page captured:', result.captures?.length, 'captures');
        pages.push({
          url,
          title: url,
          captures: result.captures,
          dimensions: result.dimensions
        });
      }

      processedPages++;
      progressFill.style.width = `${(processedPages / totalPages) * 100}%`;
    }

    if (pages.length === 0) {
      throw new Error('No pages were captured successfully');
    }

    // Generate PDF
    progressText.textContent = 'Generating PDF...';
    console.log('Generating PDF with', pages.length, 'pages');

    const pdfResult = await chrome.runtime.sendMessage({
      action: 'createPDF',
      pages,
      settings
    });

    console.log('PDF generation result:', pdfResult.error || 'success');

    if (pdfResult.error) {
      throw new Error('Failed to generate PDF: ' + pdfResult.error);
    }

    if (!pdfResult.dataUrl) {
      throw new Error('No PDF data received');
    }

    // Download PDF - prompt user for location
    progressText.textContent = 'Saving PDF...';
    console.log('Starting download:', filename);

    const downloadId = await chrome.downloads.download({
      url: pdfResult.dataUrl,
      filename: filename,
      saveAs: true  // This prompts user for save location
    });

    console.log('Download started with ID:', downloadId);

    progressText.textContent = 'Done! Check your downloads.';
    progressFill.style.width = '100%';

    // Hide progress after success
    setTimeout(() => {
      progressContainer.classList.add('hidden');
    }, 2000);

  } catch (error) {
    console.error('Error creating PDF:', error);
    // Hide progress and show persistent error
    progressContainer.classList.add('hidden');
    showError(error.message);
  } finally {
    btn.disabled = false;
    progressFill.style.background = '#4285f4';
  }
}

// Helper: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper: Sanitize filename
function sanitizeFilename(name) {
  return (name || 'webpage')
    .replace(/[<>:"/\\|?*]/g, '')
    .substring(0, 100);
}
