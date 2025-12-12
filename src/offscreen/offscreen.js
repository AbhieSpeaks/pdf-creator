// Offscreen Document - PDF Generation with jsPDF
import { jsPDF } from 'jspdf';

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'generatePDF') {
    console.log('Offscreen: Received generatePDF request', { pageCount: message.pages?.length });
    generatePDF(message.pages, message.settings)
      .then(result => {
        console.log('Offscreen: PDF generated successfully');
        sendResponse(result);
      })
      .catch(error => {
        console.error('Offscreen: PDF generation failed', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep channel open for async response
  }
});

// Generate multi-page PDF from captured screenshots
async function generatePDF(pages, settings) {
  console.log('Offscreen: Starting PDF generation', { pages: pages.length, settings });

  // Page dimensions in mm
  const pageSizes = {
    a4: [210, 297],
    letter: [215.9, 279.4],
    legal: [215.9, 355.6]
  };

  const [pageWidth, pageHeight] = settings.orientation === 'landscape'
    ? pageSizes[settings.pageSize].reverse()
    : pageSizes[settings.pageSize];

  const pdf = new jsPDF({
    orientation: settings.orientation,
    unit: 'mm',
    format: settings.pageSize
  });

  let isFirstPage = true;

  for (const page of pages) {
    // Process each capture of the page (for full page scrolling captures)
    for (let i = 0; i < page.captures.length; i++) {
      const capture = page.captures[i];

      if (!isFirstPage) {
        pdf.addPage();
      }
      isFirstPage = false;

      try {
        // Load image
        const img = await loadImage(capture.dataUrl);

        // Calculate scaling to fit page width
        const imgAspectRatio = img.width / img.height;
        const pageAspectRatio = pageWidth / pageHeight;

        let imgWidth, imgHeight;

        if (imgAspectRatio > pageAspectRatio) {
          // Image is wider - fit to width
          imgWidth = pageWidth;
          imgHeight = pageWidth / imgAspectRatio;
        } else {
          // Image is taller - fit to height
          imgHeight = pageHeight;
          imgWidth = pageHeight * imgAspectRatio;
        }

        // Center the image on the page
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        pdf.addImage(capture.dataUrl, 'PNG', x, y, imgWidth, imgHeight);
      } catch (error) {
        console.error('Error adding image to PDF:', error);
        // Add placeholder page with error message
        pdf.setFontSize(12);
        pdf.text(`Failed to capture: ${page.url}`, 10, 20);
      }
    }
  }

  // Convert to data URL
  const dataUrl = pdf.output('datauristring');

  return { dataUrl };
}

// Helper: Load image from data URL
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}
