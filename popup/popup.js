// Firefox-compatible popup.js

class CredentialHelper {
    constructor() {
        this.isLoading = false;
        this.isInitialized = false;
        this.updateTimeout = null;
        this.credentials = {
            credentialsFile: null,
            env_variables: null,
            pwsh_env_variables: null,
            lastRefreshed: null,
            accountId: null,
            roleName: null
        };
        this.init();
    }

    async init() {
        if (this.isInitialized) return;

        this.setupEventListeners();

        const loadingOverlay = document.getElementById('loadingOverlay');
        const mainContainer = document.getElementById('mainContainer');

        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        if (mainContainer) mainContainer.style.opacity = '0';

        setTimeout(async () => {
            await this.loadCredentials();
            await this.loadCredentialHistory();
            this.setupTabSystem();

            if (loadingOverlay) loadingOverlay.style.display = 'none';
            if (mainContainer) mainContainer.style.opacity = '1';

            this.isInitialized = true;
        }, 100);
    }

    setupEventListeners() {
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const target = btn.getAttribute('data-target');
                this.copyToClipboard(target, btn);
            });
        });

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

                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanels.forEach(panel => panel.classList.remove('active'));

                button.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }

    async loadCredentials() {
        if (!this.isInitialized && this.isLoading) return;
    
        try {
            this.setLoadingState(true);
    
            const result = await browser.storage.local.get(['currentCredentials']);
            const current = result.currentCredentials || {};
    
            this.credentials = {
                credentialsFile: current.credentialsFile || '',
                env_variables: current.env_variables || '',
                pwsh_env_variables: current.pwsh_env_variables || '',
                lastRefreshed: current.lastRefreshed || null,
                accountId: current.accountId || null,
                roleName: current.roleName || null
            };
    
            this.debouncedUpdate();
    
        } catch (error) {
            console.error('Error loading credentials:', error);
            this.showErrorState();
        } finally {
            this.setLoadingState(false);
        }
    }
    

    async loadCredentialHistory() {
        const container = document.getElementById('credentialsHistoryList');
        if (!container) return;
    
        try {
            const result = await browser.storage.local.get(['credentialHistory']);
            const history = result.credentialHistory || [];
    
            if (history.length === 0) {
                container.innerHTML = '<p style="text-align:center; font-size: 13px;">No previous credentials found.</p>';
                return;
            }
    
            container.innerHTML = '';
    
            history.forEach((entry, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'previous-credential-block';
    
                const timestamp = new Date(entry.lastRefreshed).toLocaleString();
    
                wrapper.innerHTML = `
                    <div class="history-header">
                      <div>
                        <strong>${index + 1}. Account:</strong> ${entry.accountId},
                        <strong>Role:</strong> ${entry.roleName}
                      </div>
                      <div><em>Refreshed: ${timestamp}</em></div>
                    </div>
                    <div class="tab-container small-tabs">
                      <div class="tab-buttons">
                        <button class="tab-btn active" data-tab="aws-${index}">AWS Credentials</button>
                        <button class="tab-btn" data-tab="bash-${index}">Bash/Zsh</button>
                        <button class="tab-btn" data-tab="powershell-${index}">PowerShell</button>
                      </div>
                      <div class="tab-content">
                        <div class="tab-panel active" id="aws-${index}">
                          <div class="credential-block">
                            <div class="block-header">
                              <h3>AWS Credentials File</h3>
                              <button class="copy-btn">Copy</button>
                            </div>
                            <pre>${entry.credentialsFile || 'N/A'}</pre>
                          </div>
                        </div>
                        <div class="tab-panel" id="bash-${index}">
                          <div class="credential-block">
                            <div class="block-header">
                              <h3>Bash/Zsh Variables</h3>
                              <button class="copy-btn">Copy</button>
                            </div>
                            <pre>${entry.env_variables || 'N/A'}</pre>
                          </div>
                        </div>
                        <div class="tab-panel" id="powershell-${index}">
                          <div class="credential-block">
                            <div class="block-header">
                              <h3>PowerShell Variables</h3>
                              <button class="copy-btn">Copy</button>
                            </div>
                            <pre>${entry.pwsh_env_variables || 'N/A'}</pre>
                          </div>
                        </div>
                      </div>
                    </div>
                `;
    
                container.appendChild(wrapper);
    
                // Setup copy buttons
                wrapper.querySelectorAll('.copy-btn').forEach(btn => {
                    const pre = btn.parentElement.nextElementSibling;
                    btn.addEventListener('click', () => {
                        navigator.clipboard.writeText(pre.textContent.trim());
                        this.showToast('Copied to clipboard!');
                    });
                });
    
                // Setup tab toggle logic for this block
                const tabButtons = wrapper.querySelectorAll('.tab-btn');
                const tabPanels = wrapper.querySelectorAll('.tab-panel');
    
                tabButtons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const tabId = btn.getAttribute('data-tab');
    
                        tabButtons.forEach(b => b.classList.remove('active'));
                        tabPanels.forEach(p => p.classList.remove('active'));
    
                        btn.classList.add('active');
                        wrapper.querySelector(`#${tabId}`).classList.add('active');
                    });
                });
            });
        } catch (error) {
            console.error('Error loading credential history:', error);
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
        const hasCredentials = !!(this.credentials.credentialsFile?.trim() ||
        this.credentials.env_variables?.trim() ||
        this.credentials.pwsh_env_variables?.trim());

        const credentialsSection = document.getElementById('credentialsSection');
        const noCredentials = document.getElementById('noCredentials');
        const lastRefreshedSection = document.getElementById('lastRefreshedSection');

        if (hasCredentials) {
            credentialsSection.style.display = 'block';
            noCredentials.style.display = 'none';
            lastRefreshedSection.style.display = 'block';

            this.updateCredentialDisplay('credentialsFile', this.credentials.credentialsFile);
            this.updateCredentialDisplay('envVariables', this.credentials.env_variables);
            this.updateCredentialDisplay('powershellVariables', this.credentials.pwsh_env_variables);
            this.updateLastRefreshedDisplay();

            const identitySection = document.getElementById('identitySection');
            const accountIdEl = document.getElementById('accountId');
            const roleNameEl = document.getElementById('roleName');
            if (identitySection && accountIdEl && roleNameEl) {
                if (this.credentials.accountId && this.credentials.roleName) {
                    accountIdEl.textContent = this.credentials.accountId;
                    roleNameEl.textContent = this.credentials.roleName;
                    identitySection.style.display = 'block';
                } else {
                    identitySection.style.display = 'none';
                }
            }

        } else {
            credentialsSection.style.display = 'none';
            noCredentials.style.display = 'block';
            lastRefreshedSection.style.display = 'none';
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

    updateLastRefreshedDisplay() {
        const lastRefreshedElement = document.getElementById('lastRefreshedTime');
        if (lastRefreshedElement) {
            if (this.credentials.lastRefreshed) {
                const lastRefreshedDate = new Date(this.credentials.lastRefreshed);

                if (isNaN(lastRefreshedDate.getTime())) {
                    lastRefreshedElement.textContent = 'Invalid date';
                    return;
                }

                const now = new Date();
                const diffMs = now - lastRefreshedDate;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);

                let timeAgo;
                if (diffMins < 1) {
                    timeAgo = 'Just now';
                } else if (diffMins < 60) {
                    timeAgo = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
                } else if (diffHours < 24) {
                    timeAgo = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                } else {
                    timeAgo = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
                }

                lastRefreshedElement.textContent = timeAgo;
            } else {
                lastRefreshedElement.textContent = 'Never';
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
            await navigator.clipboard.writeText(element.textContent);

            const originalContent = button.innerHTML;
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Copied!
            `;
            button.style.background = '#2ecc71';

            this.showToast('Copied to clipboard!');

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

        toast.style.background = type === 'error' ? '#e74c3c' : '#2ecc71';
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

let credentialHelperInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!credentialHelperInstance) {
        credentialHelperInstance = new CredentialHelper(); // `init()` handles history now
    }
});

browser.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && credentialHelperInstance?.isInitialized) {
        if (changes.currentCredentials) {
            credentialHelperInstance.loadCredentials();
        }
        if (changes.credentialHistory) {
            credentialHelperInstance.loadCredentialHistory();
        }
    }
});