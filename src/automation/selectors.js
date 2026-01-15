/**
 * 小红书自动化选择器集合
 * 用于集中管理页面元素选择器，便于维护和应对改版
 */

export const SELECTORS = {
    // 登录相关
    LOGIN: {
        LOGIN_BUTTON: [
            'text=登录',
            'a:has-text("登录")',
            'button:has-text("登录")',
            '[class*="login"]'
        ],

        // 二维码相关
        QR_CODE: [
            'canvas',
            'img[src*="qrcode"]',
            '[class*="qr"] canvas',
            '[class*="qrcode"] canvas',
            '.login-qrcode canvas'
        ],
        QR_CODE_CONTAINER: [
            '[class*="qr-box"]',
            '[class*="qrcode-box"]',
            '[class*="login-box"]',
            '.login-container'
        ],

        // 加载状态
        LOADING: [
            'text=加载中',
            'text=登录加载中',
            '[class*="loading"]'
        ],

        // 用户信息
        USER_INFO: {
            NICKNAME: [
                '.name-box', // Verified from debug HTML
                '.account-name', // Verified from debug HTML
                '.user-name',
                '.user-info .name',
            ],
            AVATAR: [
                'img.user_avatar', // Verified from debug HTML
                '.avatar img',
                '.user-info img',
                '.header-container img.avatar',
            ],
            ID: [
                '.user-id',
                'text=/小红书账号[:：]/', // Verified "小红书账号: 6896912017"
                'text=/小红书号[:：]/'
            ]
        },
        LOGGED_IN_INDICATORS: [
            '.user-info',        // Confirmed in HTML
            '.user_avatar',      // Confirmed in HTML
            '.name-box',         // Confirmed in HTML
            'input[placeholder*="标题"]',
            'textarea[placeholder*="标题"]',
            '.main-container .user .link-wrapper .channel',
            '#creator-header'
        ]
    },

    // 弹窗关闭按钮
    POPUPS: {
        CLOSE_BUTTONS: [
            '[aria-label="关闭"]',
            '.ant-modal-close',
            '.close-btn',
            'button:has-text("关闭")',
            '[class*="guide"] [class*="btn"]', // 引导弹窗按钮
            '.d-popover', // 提示气泡
            '.short-note-tooltip', // 提示气泡内容
            '.icon-btn-close' // Common pattern
        ]
    },

    // 发布页面 - Tab 切换
    PUBLISH: {
        TABS: {
            IMAGE: {
                TEXT: '上传图文',
                LOCATOR: '.creator-tab:has-text("上传图文"):not([style*="-9999px"])',
                ACTIVE_CLASS: 'active'
            },
            VIDEO: {
                TEXT: '上传视频',
                LOCATOR: '.creator-tab:has-text("上传视频"):not([style*="-9999px"])',
                ACTIVE_CLASS: 'active'
            }
        },

        // 文件上传
        UPLOAD_INPUT: 'input[type="file"]',

        // 视频特定
        VIDEO: {
            UPLOAD_SUCCESS: 'text=上传成功',
            // 取封面按钮
            COVER_SELECT: 'text=编辑封面',
        },

        // 编辑器状态
        EDITOR: {
            TITLE_INPUT: [
                'input[placeholder*="标题"]',
                '.title-input',
                '.c-input_title',
                'textarea[placeholder*="标题"]'
            ],
            CONTENT_INPUT: [
                'div[contenteditable="true"]',
                '#post-textarea',
                '.ql-editor',
                'p[data-placeholder]'
            ],
            NEXT_BUTTON: [
                'button:has-text("下一步")',
                'button:has-text("确定")',
                'div:has-text("下一步")'
            ]
        },

        // 元数据输入
        METADATA: {
            TAG_INPUT: 'input[placeholder*="话题"]',
            LOCATION_INPUT: 'input[placeholder*="地点"]'
        },

        // 提交
        SUBMIT: {
            PUBLISH_BUTTON: 'button:has-text("发布")',
            SUCCESS_TOAST: [
                'text=发布成功',
                '.success-toast',
                '.ant-message-success'
            ]
        }
    }
};

export default SELECTORS;
