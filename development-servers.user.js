// ==UserScript==
// @name         Letta ADE Surgical Switcher
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Add local environment switching to ADE (Fixed Field Mapping & Navigation)
// @match        https://app.letta.com/development-servers/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    const API_KEY = '<replace>';
    const BASE_URL = 'http://letta.container-dns:8283';
    let lastPath = "";

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
        }, 1000);
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
            container.style = 'display:flex; align-items:center; gap:8px; margin-right:10px; padding:2px 8px; background:#222; border-radius:4px; border:1px solid #444; color:#fff; font-size:12px; z-index:9999;';

            const label = document.createElement('span');
            label.innerText = 'Env:';
            container.appendChild(label);

            const select = document.createElement('select');
            select.style = 'background:transparent; color:#fff; border:none; outline:none; cursor:pointer; font-weight:bold; max-width:150px;';

            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.innerText = 'None';
            noneOpt.style.background = '#333';
            select.appendChild(noneOpt);

            envs.forEach(env => {
                const opt = document.createElement('option');
                opt.value = env.id;
                opt.innerText = env.connectionName || env.name || env.id;
                opt.selected = (env.id === currentEnvId);
                opt.style.background = '#333';
                select.appendChild(opt);
            });

            select.onchange = async () => {
                const newEnvId = select.value || null;
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
                        select.style.color = '#00ff00';
                        setTimeout(() => select.style.color = '#fff', 2000);
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
    style.textContent = '.bg-background-warning { display: none !important; }';
    (document.head || document.documentElement).appendChild(style);

})();

