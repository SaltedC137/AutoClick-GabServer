// ==UserScript==
// @name         Takeing Server
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  自动化脚本用于腾讯云资源抢购
// @author       You
// @match        *://*.cloud.tencent.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    // 检查是否在正确的域名上运行
    if (!window.location.hostname.includes('cloud.tencent.com')) {
        return;
    }
    
    // 定义选择器常量
    const SELECTORS = {
        TARGET_BUTTON: '.uno-grid-row .uno-button-inner-wrap',
        DIALOG_BODY: '.uno-dialog-body',
        DIALOG_CONFIRM: '.uno-dialog-footer .uno-button-inner-wrap'
    };
    
    // 定义需要排除的按钮文本
    const EXCLUDED_TEXTS = ['添加提醒', '取消提醒'];
    // 定义表示已抢完的文本
    const SOLD_OUT_TEXTS = ['已抢光'];
    
    // 默认频率设置（毫秒）
    const DEFAULT_MAIN_INTERVAL = 100;
    const DEFAULT_CONFIRM_INTERVAL = 100;
    
    // 脚本状态枚举
    const ScriptStatus = {
        PENDING: '待命中',
        RUNNING: '运行中',
        PAUSED: '已暂停',
        STOPPED: '已停止',
        PURCHASING: '抢购中',
        ERROR: '错误'
    };
    
    // 脚本管理器
    const scriptManager = {
        mainInterval: null,
        confirmInterval: null,
        currentMainInterval: DEFAULT_MAIN_INTERVAL,
        currentConfirmInterval: DEFAULT_CONFIRM_INTERVAL,
        isStopped: false,
        isPaused: false,
        
        // 启动脚本
        start() {
            if (!this.mainInterval && !this.isStopped) {
                this.mainInterval = setInterval(() => mainLoop.execute(), this.currentMainInterval);
            }
            this.isPaused = false;
        },
        
        // 暂停脚本
        pause() {
            this.clearAllIntervals();
            this.isPaused = true;
        },
        
        // 停止脚本
        stop() {
            this.clearAllIntervals();
            this.isStopped = true;
        },
        
        // 清理所有定时器
        clearAllIntervals() {
            if (this.mainInterval) {
                clearInterval(this.mainInterval);
                this.mainInterval = null;
            }
            if (this.confirmInterval) {
                clearInterval(this.confirmInterval);
                this.confirmInterval = null;
            }
        }
    };
    
    // 主循环逻辑
    const mainLoop = {
        execute() {
            // 如果脚本已停止，则不执行任何操作
            if (scriptManager.isStopped) {
                return;
            }
            
            try {
                // 如果已经处理过对话框确认，不需要再检查按钮
                if (dialogHandler.checkAndHandle()) {
                    return;
                }
                
                // 否则继续检查目标按钮
                buttonClicker.clickTargetButton();
            } catch (error) {
                uiManager.updateStatus(ScriptStatus.ERROR, `执行出错: ${error.message}`);
                console.error('脚本执行出错:', error);
            }
        }
    };
    
    // 按钮点击处理
    const buttonClicker = {
        clickTargetButton() {
            const buttons = document.querySelectorAll(SELECTORS.TARGET_BUTTON);
            
            // 改进：检查按钮数量并确保不是空的
            if (buttons.length >= 2) {
                const targetButton = buttons[1];
                // 添加检查确保按钮元素存在
                if (!targetButton) {
                    uiManager.updateStatus(ScriptStatus.RUNNING, '未找到目标按钮');
                    console.log('目标按钮不存在');
                    return false;
                }
                
                const buttonText = targetButton.innerText ? targetButton.innerText.trim() : '';
                
                // 检查是否是已抢光状态
                if (SOLD_OUT_TEXTS.includes(buttonText)) {
                    scriptManager.stop();
                    uiManager.updateStatus(ScriptStatus.STOPPED, `检测到"已抢光"，脚本已停止运行 [按钮: ${buttonText}]`);
                    uiManager.disableToggleButton();
                    console.log('检测到"已抢光"，脚本已停止运行');
                    return false;
                }
                
                // 检查按钮文本是否不在排除列表中
                if (!EXCLUDED_TEXTS.includes(buttonText)) {
                    // 确保按钮存在且可点击
                    if (targetButton && typeof targetButton.click === 'function') {
                        targetButton.click();
                        console.log('已点击'); // 在控制台输出"已点击"
                        uiManager.updateStatus(ScriptStatus.RUNNING, `已点击按钮: ${buttonText}`);
                        console.log('已点击按钮:', buttonText);
                        return true;
                    } else {
                        uiManager.updateStatus(ScriptStatus.RUNNING, `按钮不可点击: ${buttonText}`);
                        console.log('按钮不可点击');
                    }
                } else {
                    uiManager.updateStatus(ScriptStatus.PENDING, `忽略按钮: ${buttonText}`);
                    console.log('忽略按钮:', buttonText);
                }
            } else if (buttons.length > 0) {
                // 如果只有少量按钮，显示所有按钮信息
                let buttonTexts = [];
                for (let i = 0; i < buttons.length; i++) {
                    const text = buttons[i].innerText ? buttons[i].innerText.trim() : '无文本';
                    buttonTexts.push(`按钮${i}: "${text}"`);
                }
                uiManager.updateStatus(ScriptStatus.RUNNING, `检测到 ${buttons.length} 个按钮 [${buttonTexts.join(', ')}]`);
                console.log('按钮数量不足，当前数量:', buttons.length);
            } else {
                uiManager.updateStatus(ScriptStatus.RUNNING, '未检测到按钮');
                console.log('未检测到按钮');
            }
            return false;
        }
    };
    
    // 对话框处理
    const dialogHandler = {
        checkAndHandle() {
            const dialogElements = document.querySelectorAll(SELECTORS.DIALOG_BODY);
            
            if (dialogElements.length > 0) {
                // 清理主定时器
                if (scriptManager.mainInterval) {
                    clearInterval(scriptManager.mainInterval);
                    scriptManager.mainInterval = null;
                }
                
                // 避免重复创建确认定时器
                if (!scriptManager.confirmInterval) {
                    // 创建确认点击定时器，使用可配置的频率
                    scriptManager.confirmInterval = setInterval(() => {
                        const confirmButtons = document.querySelectorAll(SELECTORS.DIALOG_CONFIRM);
                        
                        if (confirmButtons.length > 0) {
                            // 确保按钮存在且可点击
                            if (confirmButtons[0] && typeof confirmButtons[0].click === 'function') {
                                confirmButtons[0].click();
                                console.log('已点击'); // 在控制台输出"已点击"
                                uiManager.updateStatus(ScriptStatus.PURCHASING, '已点击确认按钮');
                                console.log('抢购中... 已点击确认按钮');
                            } else {
                                uiManager.updateStatus(ScriptStatus.PURCHASING, '确认按钮不可点击');
                                console.log('确认按钮不可点击');
                            }
                        } else {
                            uiManager.updateStatus(ScriptStatus.PURCHASING, '未找到确认按钮');
                            console.log('未找到确认按钮');
                        }
                    }, scriptManager.currentConfirmInterval);
                }
                
                uiManager.updateStatus(ScriptStatus.PURCHASING, '检测到对话框，开始确认点击');
                console.log('检测到对话框，开始确认点击');
                return true;
            }
            return false;
        }
    };
    
    // UI管理器
    const uiManager = {
        floatingWindow: null,
        
        // 创建悬浮窗
        createFloatingWindow() {
            // 避免重复创建悬浮窗
            if (document.getElementById('tampermonkey-floating-window')) {
                return document.getElementById('tampermonkey-floating-window');
            }
            
            const container = document.createElement('div');
            container.id = 'tampermonkey-floating-window';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 320px;
                background: rgba(0, 0, 0, 0.85);
                color: white;
                border-radius: 8px;
                padding: 12px;
                font-family: Arial, sans-serif;
                font-size: 12px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(5px);
                border: 1px solid rgba(255, 255, 255, 0.1);
            `;
            
            container.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-weight: bold; color: #4CAF50;">抢购脚本 by SaltedC137</div>
                    <div id="script-status" style="background: #2196F3; padding: 2px 6px; border-radius: 4px;">待命中</div>
                </div>
                <div style="margin-bottom: 6px;">
                    <div style="color: #aaa; margin-bottom: 2px;">状态信息:</div>
                    <div id="script-message" style="word-break: break-all;">等待执行...</div>
                </div>
                <div style="margin-bottom: 8px;">
                    <div style="color: #aaa; margin-bottom: 2px;">频率设置:</div>
                    <div style="display: flex; gap: 5px;">
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 2px;">主频率 (ms):</label>
                            <input type="number" id="main-interval" value="${DEFAULT_MAIN_INTERVAL}" min="10" max="1000" 
                                   style="width: 100%; padding: 2px; background: rgba(255,255,255,0.1); border: 1px solid #555; color: white; border-radius: 3px;">
                        </div>
                        <div style="flex: 1;">
                            <label style="display: block; margin-bottom: 2px;">确认频率 (ms):</label>
                            <input type="number" id="confirm-interval" value="${DEFAULT_CONFIRM_INTERVAL}" min="10" max="1000" 
                                   style="width: 100%; padding: 2px; background: rgba(255,255,255,0.1); border: 1px solid #555; color: white; border-radius: 3px;">
                        </div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <div>
                        <div style="color: #aaa; margin-bottom: 2px;">更新时间:</div>
                        <div id="script-time">--:--:--</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="color: #aaa; margin-bottom: 2px;">操作:</div>
                        <button id="apply-settings" style="background: #FF9800; color: white; border: none; padding: 2px 6px; border-radius: 4px; cursor: pointer; margin-right: 5px;">应用</button>
                        <button id="toggle-button" style="background: #f44336; color: white; border: none; padding: 2px 6px; border-radius: 4px; cursor: pointer;">暂停</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(container);
            this.floatingWindow = container;
            
            // 添加事件监听器
            this.attachEventListeners();
            
            return container;
        },
        
        // 添加事件监听器
        attachEventListeners() {
            // 确保悬浮窗存在
            if (!this.floatingWindow) return;
            
            const toggleButton = this.floatingWindow.querySelector('#toggle-button');
            const applyButton = this.floatingWindow.querySelector('#apply-settings');
            const mainIntervalInput = this.floatingWindow.querySelector('#main-interval');
            const confirmIntervalInput = this.floatingWindow.querySelector('#confirm-interval');
            
            // 检查按钮元素是否存在
            if (toggleButton) {
                toggleButton.addEventListener('click', () => {
                    scriptManager.isPaused = !scriptManager.isPaused;
                    if (scriptManager.isPaused) {
                        scriptManager.pause();
                        toggleButton.textContent = '继续';
                        toggleButton.style.background = '#4CAF50';
                        this.updateStatus(ScriptStatus.PAUSED, '脚本已暂停运行');
                    } else {
                        scriptManager.start();
                        toggleButton.textContent = '暂停';
                        toggleButton.style.background = '#f44336';
                        this.updateStatus(ScriptStatus.RUNNING, '脚本已恢复运行');
                    }
                });
            }
            
            if (applyButton) {
                applyButton.addEventListener('click', () => {
                    const newMainInterval = parseInt(mainIntervalInput.value);
                    const newConfirmInterval = parseInt(confirmIntervalInput.value);
                    
                    if (isNaN(newMainInterval) || isNaN(newConfirmInterval) || 
                        newMainInterval < 10 || newMainInterval > 1000 || 
                        newConfirmInterval < 10 || newConfirmInterval > 1000) {
                        this.updateStatus(ScriptStatus.ERROR, '频率必须在10-1000毫秒之间');
                        return;
                    }
                    
                    scriptManager.currentMainInterval = newMainInterval;
                    scriptManager.currentConfirmInterval = newConfirmInterval;
                    
                    // 如果脚本正在运行，重新启动以应用新设置
                    if (!scriptManager.isPaused && !scriptManager.isStopped) {
                        scriptManager.pause();
                        scriptManager.start();
                    }
                    
                    this.updateStatus(ScriptStatus.RUNNING, `主频率: ${scriptManager.currentMainInterval}ms, 确认频率: ${scriptManager.currentConfirmInterval}ms`);
                });
            }
        },
        
        // 更新悬浮窗信息
        updateStatus(status, message) {
            if (!this.floatingWindow) return;
            
            const statusElement = this.floatingWindow.querySelector('#script-status');
            const messageElement = this.floatingWindow.querySelector('#script-message');
            const timeElement = this.floatingWindow.querySelector('#script-time');
            
            if (statusElement) statusElement.textContent = status;
            if (messageElement) messageElement.textContent = message;
            if (timeElement) timeElement.textContent = new Date().toLocaleTimeString();
        },
        
        // 禁用切换按钮
        disableToggleButton() {
            if (!this.floatingWindow) return;
            
            const toggleButton = this.floatingWindow.querySelector('#toggle-button');
            if (toggleButton) {
                toggleButton.disabled = true;
                toggleButton.textContent = '已停止';
                toggleButton.style.background = '#666';
            }
        }
    };
    
    // 初始化
    function init() {
        console.log('脚本初始化开始');
        
        // 等待页面加载完成再初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('DOM加载完成');
                // 创建悬浮窗
                uiManager.createFloatingWindow();
                
                // 启动主循环
                scriptManager.start();
            });
        } else {
            // 页面已经加载完成
            console.log('页面已加载完成');
            // 创建悬浮窗
            uiManager.createFloatingWindow();
            
            // 启动主循环
            scriptManager.start();
        }
        
        // 页面卸载时清理定时器
        window.addEventListener('beforeunload', () => scriptManager.clearAllIntervals());
    }
    
    // 启动初始化
    init();
    
    // 添加周期性调试信息
    setInterval(() => {
        console.log('脚本运行状态 - 已停止:', scriptManager.isStopped, '已暂停:', scriptManager.isPaused);
    }, 5000);
})();