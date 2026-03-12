const toggleBtn = document.getElementById('toggle') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
let isActive = false;

toggleBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'REACTPEEK_TOGGLE_FROM_POPUP' });
  isActive = !isActive;
  updateButton();
  window.close();
});

function updateButton() {
  if (isActive) {
    toggleBtn.textContent = 'Deactivate Inspector';
    toggleBtn.classList.add('active');
  } else {
    toggleBtn.textContent = 'Activate Inspector';
    toggleBtn.classList.remove('active');
  }
}

// Check if current page has React
async function checkPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      statusEl.textContent = 'No active tab';
      return;
    }

    const url = tab.url || '';
    const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');

    if (!isLocalhost) {
      statusEl.textContent = 'ReactPeek works on localhost (dev mode)';
      statusEl.className = 'status no-react';
      toggleBtn.disabled = true;
      toggleBtn.style.opacity = '0.5';
      return;
    }

    statusEl.textContent = 'Ready — localhost detected';
    statusEl.className = 'status react';
  } catch {
    statusEl.textContent = 'Unable to check page';
  }
}

checkPage();
