// ==UserScript==
// @name         Letta ADE Surgical Switcher
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Add local environment switching to ADE with online/offline status (Cloud Parity)
// @match        https://app.letta.com/development-servers/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    const API_KEY = '<replace>';
    const BASE_URL = 'http://letta.container-dns:8283';
    let lastPath = "";

    // Helper to determine if an environment is "online" based on lastHeartbeat
    function isEnvOnline(env) {
        if (!env.lastHeartbeat) return false;
        const now = Date.now();
        // Environments are considered online if seen in the last 60 seconds
        return (now - env.lastHeartbeat) < 60000;
    }

    async function init() {
        const agentMatch = window.location.pathname.match(/agent-[a-f0-9-]+/);
        if (!agentMatch) return;
        const agentId = agentMatch[0];

        const footerSelector = 'div.w-full.flex.gap-1.items-center.flex-row.generic-panel';

        // Wait for footer to appear
        const poll = setInterval(async () => {
            const footer = document.querySelector(footerSelector);
            if (footer) {
                // Only inject if not already present for THIS agent
                const existing = document.querySelector('#letta-env-switcher');
                if (!existing || existing.dataset.agentId !== agentId) {
                    if (existing) existing.remove();
                    clearInterval(poll);
                    await injectSwitcher(footer, agentId);
                }
            }
        }, 500);
    }

    async function injectSwitcher(footer, agentId) {
        try {
            // 1. Fetch local environments
            const res = await fetch(`${BASE_URL}/v1/environments`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            const data = await res.json();
            const envs = data.connections || data.results || [];

            // 2. Fetch current agent state
            const agentRes = await fetch(`${BASE_URL}/v1/agents/${agentId}`, {
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            });
            const agent = await agentRes.json();
            const currentEnvId = agent.environment_id;

            // 3. Create UI
            const container = document.createElement('div');
            container.id = 'letta-env-switcher';
            container.dataset.agentId = agentId;
            container.style = 'display:flex; align-items:center; gap:8px; margin-right:10px; padding:4px 10px; background:rgba(30, 30, 30, 0.9); backdrop-filter:blur(4px); border-radius:6px; border:1px solid #444; color:#fff; font-size:12px; z-index:9999; box-shadow: 0 2px 8px rgba(0,0,0,0.5);';

            const statusDot = document.createElement('div');
            const currentEnv = envs.find(e => e.id === currentEnvId);
            const online = currentEnv && isEnvOnline(currentEnv);
            statusDot.id = 'letta-env-status-dot';
            statusDot.style = `width:8px; height:8px; border-radius:50%; background:${online ? '#00ff00' : '#666'}; box-shadow: 0 0 5px ${online ? '#00ff00' : 'transparent'}; transition: all 0.3s ease;`;
            container.appendChild(statusDot);

            const label = document.createElement('span');
            label.innerText = 'Env:';
            label.style = 'color:#aaa; font-weight:500;';
            container.appendChild(label);

            const select = document.createElement('select');
            select.style = 'background:transparent; color:#fff; border:none; outline:none; cursor:pointer; font-weight:600; max-width:180px; appearance: none; -webkit-appearance: none;';

            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.innerText = '○ None';
            noneOpt.style.background = '#222';
            select.appendChild(noneOpt);

            envs.forEach(env => {
                const opt = document.createElement('option');
                opt.value = env.id;
                const online = isEnvOnline(env);
                const statusIcon = online ? '●' : '○';
                opt.innerText = `${statusIcon} ${env.connectionName || env.name || env.id}`;
                opt.selected = (env.id === currentEnvId);
                opt.style.background = '#222';
                if (online) opt.style.color = '#00ff00';
                select.appendChild(opt);
            });

            select.onchange = async () => {
                const newEnvId = select.value || null;
                const selectedEnv = envs.find(e => e.id === newEnvId);
                const newIsOnline = selectedEnv && isEnvOnline(selectedEnv);
                
                // Update status dot immediately for feedback
                statusDot.style.background = newIsOnline ? '#00ff00' : '#666';
                statusDot.style.boxShadow = `0 0 5px ${newIsOnline ? '#00ff00' : 'transparent'}`;

                select.disabled = true;
                try {
                    const patchRes = await fetch(`${BASE_URL}/v1/agents/${agentId}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ environment_id: newEnvId })
                    });
                    if (patchRes.ok) {
                        select.style.color = '#ffff00';
                        setTimeout(() => select.style.color = '#fff', 750);
                    }
                } catch (e) {
                    select.style.color = '#ff0000';
                } finally {
                    select.disabled = false;
                }
            };

            container.appendChild(select);
            footer.insertBefore(container, footer.firstChild);

            // Periodically hide the Self-Hosted label if it reappears
            setInterval(() => {
                const selfHostedLabel = Array.from(footer.querySelectorAll('div, span')).find(el => el.innerText === 'Self-Hosted');
                if (selfHostedLabel) selfHostedLabel.style.display = 'none';
            }, 500);

        } catch (err) {
            console.error("Letta Switcher Error:", err);
        }
    }

    // Monitor for URL changes
    setInterval(() => {
        if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            init();
        }
    }, 1000);

    const style = document.createElement('style');
    style.textContent = `
        .bg-background-warning { display: none !important; }
        #letta-env-switcher select option { padding: 8px; }
        #letta-env-switcher:hover { border-color: #666; background: rgba(40, 40, 40, 0.9); }
    `;
    (document.head || document.documentElement).appendChild(style);

})();
