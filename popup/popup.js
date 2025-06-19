// Credential Helper Class
class CredentialHelper {
    constructor() {
        this.isLoading = false;
        this.isInitialized = false;
        this.updateTimeout = null;
        this.credentials = {
            credentialsFile: null,
            env_variables: null,
            pwsh_env_variables: null
        };
        
        this.init();
    }

    async init() {
        if (this.isInitialized) return;
        
        this.setupEventListeners();
        
        // Show loading overlay and hide main container initially
        const loadingOverlay = document.getElementById('loadingOverlay');
        const mainContainer = document.getElementById('mainContainer');
        
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        if (mainContainer) mainContainer.style.opacity = '0';
        
        // Load credentials with a slight delay to prevent flickering
        setTimeout(async () => {
            await this.loadCredentials();
            this.setupTabSystem();
            
            // Hide loading and show main container
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            if (mainContainer) mainContainer.style.opacity = '1';
            
            this.isInitialized = true;
        }, 100);
    }

    setupEventListeners() {
        // Copy button event listeners
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const target = btn.getAttribute('data-target');
                this.copyToClipboard(target, btn);
            });
        });

        // Changelog link
        const changelogLink = document.getElementById('changelogLink');
        if (changelogLink) {
            changelogLink.addEventListener('click', (e) => {
                e.preventDefault();
                browser.tabs.create({ url: browser.runtime.getURL('../options/changelog.html') });
            });
        }
    }

    setupTabSystem() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanels = document.querySelectorAll('.tab-panel');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all buttons and panels
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanels.forEach(panel => panel.classList.remove('active'));
                
                // Add active class to clicked button and corresponding panel
                button.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }

    async loadCredentials() {
        if (!this.isInitialized && this.isLoading) return; // Prevent multiple loads during init
        
        try {
            this.setLoadingState(true);
            
            const result = await browser.storage.sync.get(['credentialsFile', 'env_variables', 'pwsh_env_variables']);
            
            this.credentials = {
                credentialsFile: result.credentialsFile || null,
                env_variables: result.env_variables || null,
                pwsh_env_variables: result.pwsh_env_variables || null
            };

            this.debouncedUpdate();
            
        } catch (error) {
            console.error('Error loading credentials:', error);
            this.showErrorState();
        } finally {
            this.setLoadingState(false);
        }
    }

    debouncedUpdate() {
        clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => {
            this.updateUI();
            this.updateStatus();
        }, 50);
    }

    updateUI() {
        const hasCredentials = this.credentials.credentialsFile || 
                              this.credentials.env_variables || 
                              this.credentials.pwsh_env_variables;

        const credentialsSection = document.getElementById('credentialsSection');
        const noCredentials = document.getElementById('noCredentials');

        if (hasCredentials) {
            credentialsSection.style.display = 'block';
            noCredentials.style.display = 'none';
            
            // Update credential displays
            this.updateCredentialDisplay('credentialsFile', this.credentials.credentialsFile);
            this.updateCredentialDisplay('envVariables', this.credentials.env_variables);
            this.updateCredentialDisplay('powershellVariables', this.credentials.pwsh_env_variables);
        } else {
            credentialsSection.style.display = 'none';
            noCredentials.style.display = 'block';
        }
    }

    updateCredentialDisplay(elementId, content) {
        const element = document.getElementById(elementId);
        if (element) {
            if (content) {
                element.textContent = content;
                element.classList.remove('loading');
            } else {
                element.textContent = 'No credentials available. Please authenticate with AWS SSO first.';
                element.classList.add('loading');
            }
        }
    }

    updateStatus() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusDot = statusIndicator.querySelector('.status-dot');
        const statusText = statusIndicator.querySelector('.status-text');
        
        const hasCredentials = this.credentials.credentialsFile || 
                              this.credentials.env_variables || 
                              this.credentials.pwsh_env_variables;

        if (hasCredentials) {
            statusDot.style.background = '#2ecc71';
            statusText.textContent = 'Active';
        } else {
            statusDot.style.background = '#f39c12';
            statusText.textContent = 'Waiting';
        }
    }

    setLoadingState(loading) {
        this.isLoading = loading;
        const codeBlocks = document.querySelectorAll('.code-block pre');
        
        if (loading) {
            codeBlocks.forEach(block => {
                block.classList.add('loading');
                block.textContent = 'Loading credentials...';
            });
        }
    }

    showErrorState() {
        const codeBlocks = document.querySelectorAll('.code-block pre');
        codeBlocks.forEach(block => {
            block.classList.remove('loading');
            block.textContent = 'Error loading credentials. Please try refreshing.';
        });
        
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');
        statusDot.style.background = '#e74c3c';
        statusText.textContent = 'Error';
    }

    async copyToClipboard(target, button) {
        const element = document.getElementById(target);
        if (!element || !element.textContent.trim()) {
            this.showToast('No content to copy', 'error');
            return;
        }

        try {
            // Create a temporary textarea element for copying
            const textarea = document.createElement('textarea');
            textarea.value = element.textContent;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);

            // Update button state
            const originalContent = button.innerHTML;
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Copied!
            `;
            button.style.background = '#2ecc71';

            // Show toast notification
            this.showToast('Copied to clipboard!');

            // Reset button after 2 seconds
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.style.background = '#3498db';
            }, 2000);

        } catch (error) {
            console.error('Error copying to clipboard:', error);
            this.showToast('Failed to copy', 'error');
        }
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = toast.querySelector('.toast-message');
        
        toastMessage.textContent = message;
        
        if (type === 'error') {
            toast.style.background = '#e74c3c';
        } else {
            toast.style.background = '#2ecc71';
        }
        
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Global instance to prevent multiple initializations
let credentialHelperInstance = null;

// Initialize the credential helper when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (!credentialHelperInstance) {
        credentialHelperInstance = new CredentialHelper();
    }
});

// Listen for storage changes to update UI in real-time
if (typeof browser !== 'undefined' && browser.storage) {
    browser.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && credentialHelperInstance && credentialHelperInstance.isInitialized) {
            // Use the existing instance instead of creating a new one
            credentialHelperInstance.loadCredentials();
        }
    });
}
