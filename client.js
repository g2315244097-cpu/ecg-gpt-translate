window.__ModuleLoader__.load({
  id: '@ppppeter/ecg-gpt-translate',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useRef = React.useRef;
    const useEffect = React.useEffect;
    const useCallback = React.useCallback;

    const SITEKEY = '0x4AAAAAACp59OmqK46GHwLi';
    const SITE_URL = 'https://ecg-gpt.cards-lab.org/';
    const ENDPOINT = '/ecg-gpt/analyze';
    const TRANSLATE_ENDPOINT = '/ecg-gpt/translate';
    const TURNSTILE_BASE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

    const CSS = `
.ecgx-card{display:flex;flex-direction:column;gap:0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;overflow:hidden}
.ecgx-head{display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.ecgx-head:hover{background:var(--dsw-alias-bg-layer-2)}
.ecgx-title{font-weight:600}
.ecgx-hint{color:var(--dsw-alias-label-secondary);font-size:12px}
.ecgx-chev{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px}
.ecgx-body{display:flex;flex-direction:column;gap:10px;padding:12px;border-top:1px solid var(--dsw-alias-border-l1)}
.ecgx-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ecgx-drop{flex:1 1 220px;min-height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:10px;cursor:pointer;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px}
.ecgx-drop:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.ecgx-drop[data-ready="1"]{border-style:solid;border-color:var(--dsw-alias-state-success-primary)}
.ecgx-filename{color:var(--dsw-alias-label-primary);font-size:12px;word-break:break-all}
.ecgx-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 14px;font:inherit;cursor:pointer}
.ecgx-btn:disabled{opacity:.45;cursor:not-allowed}
.ecgx-btn--primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.ecgx-link{color:var(--dsw-alias-brand-primary);font-size:12px;text-decoration:none}
.ecgx-link:hover{text-decoration:underline}
.ecgx-ts{min-height:65px;display:flex;justify-content:center;align-items:center}
.ecgx-err{color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:pre-wrap;word-break:break-word}
.ecgx-note{font-size:11px;color:var(--dsw-alias-label-secondary)}
.ecgx-divider{height:1px;background:var(--dsw-alias-border-l1);margin:2px 0}
.ecgx-textarea{width:100%;box-sizing:border-box;min-height:76px;resize:vertical;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:8px}
.ecgx-result{display:flex;flex-direction:column;gap:8px}
.ecgx-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.ecgx-zh{font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1)}
.ecgx-en{font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);max-height:180px;overflow:auto}
`;

    let turnstilePromise = null;
    function loadTurnstile() {
      if (window.turnstile) return Promise.resolve(window.turnstile);
      if (turnstilePromise) return turnstilePromise;
      turnstilePromise = new Promise((resolve, reject) => {
        const name = '__ecgGptTurnstileOnload';
        const previous = window[name];
        window[name] = function () {
          if (typeof previous === 'function') previous();
          if (window.turnstile) resolve(window.turnstile);
          else reject(new Error('Turnstile 已加载，但未暴露 turnstile 对象'));
        };
        const script = document.createElement('script');
        script.src = TURNSTILE_BASE + '&onload=' + name;
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error('无法加载 Cloudflare Turnstile 脚本（可能被网络或 CSP 拦截）'));
        document.head.appendChild(script);
      });
      return turnstilePromise;
    }

    async function translateDirect(text) {
      const url =
        'https://api.mymemory.translated.net/get?q=' +
        encodeURIComponent(text.slice(0, 4500)) +
        '&langpair=en|zh-CN';
      const response = await fetch(url);
      if (!response.ok) return null;
      const body = await response.json();
      const translated = body && body.responseData && body.responseData.translatedText;
      if (typeof translated !== 'string') return null;
      const trimmed = translated.trim();
      if (trimmed === '' || /MYMEMORY WARNING/i.test(trimmed)) return null;
      return trimmed;
    }

    /** Keep a plain fallback translation readable: one finding per numbered line. */
    function formatSentences(text) {
      const parts = text
        .split(/(?<=[。！？；\n])/)
        .map((part) => part.trim())
        .filter((part) => part !== '');
      if (parts.length <= 1) return text;
      return parts.map((part, index) => index + 1 + '. ' + part).join('\n');
    }

    function readImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          const comma = result.indexOf(',');
          const base64 = comma >= 0 ? result.slice(comma + 1) : '';
          if (base64 === '') {
            reject(new Error('读取图片失败'));
            return;
          }
          resolve({
            name: file.name || 'ecg.png',
            mimeType: file.type || 'image/png',
            bytes: file.size || 0,
            base64,
          });
        };
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
      });
    }

    function EcgTranslate(props) {
      const openSite = props && props.openSite;
      const [open, setOpen] = useState(false);
      const [image, setImage] = useState(null);
      const [token, setToken] = useState('');
      const [turnstileError, setTurnstileError] = useState('');
      const [running, setRunning] = useState(false);
      const [error, setError] = useState('');
      const [result, setResult] = useState(null);
      const [copied, setCopied] = useState(false);

      const [pasteText, setPasteText] = useState('');
      const [pasteBusy, setPasteBusy] = useState(false);
      const [pasteError, setPasteError] = useState('');
      const [pasteResult, setPasteResult] = useState('');
      const [pasteCopied, setPasteCopied] = useState(false);

      const widgetContainer = useRef(null);
      const widgetId = useRef(null);
      const fileInput = useRef(null);

      useEffect(() => {
        if (!open) return;
        let cancelled = false;
        loadTurnstile()
          .then((turnstile) => {
            if (cancelled || widgetId.current !== null || !widgetContainer.current) return;
            widgetId.current = turnstile.render(widgetContainer.current, {
              sitekey: SITEKEY,
              theme: 'auto',
              callback: (value) => {
                setToken(value);
                setTurnstileError('');
              },
              'expired-callback': () => setToken(''),
              'error-callback': (code) => {
                setToken('');
                const detail = code ? '（错误码 ' + String(code) + '）' : '';
                setTurnstileError(
                  'Turnstile 验证组件无法在本页面工作' + detail +
                    '：目标站点的 sitekey 很可能只允许它自己的域名。请改用下面的「粘贴翻译」。',
                );
              },
            });
          })
          .catch((reason) => {
            if (!cancelled) setTurnstileError(String((reason && reason.message) || reason));
          });
        return () => {
          cancelled = true;
          const id = widgetId.current;
          widgetId.current = null;
          if (id !== null && window.turnstile) {
            try {
              window.turnstile.remove(id);
            } catch (_ignored) {
              /* widget already gone */
            }
          }
        };
      }, [open]);

      const onPick = useCallback((event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        setError('');
        readImage(file).then(setImage).catch((reason) => setError(String((reason && reason.message) || reason)));
      }, []);

      const onDrop = useCallback((event) => {
        event.preventDefault();
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file) return;
        setError('');
        readImage(file).then(setImage).catch((reason) => setError(String((reason && reason.message) || reason)));
      }, []);

      const analyze = useCallback(async () => {
        if (!image) {
          setError('请先选择一张心电图图片');
          return;
        }
        if (!token) {
          setError('请先完成人机验证');
          return;
        }
        setRunning(true);
        setError('');
        setResult(null);
        try {
          const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              imageBase64: image.base64,
              mimeType: image.mimeType,
              filename: image.name,
              turnstileToken: token,
            }),
          });
          const data = await response.json();
          if (!data || data.ok !== true) {
            setError((data && data.error) || '分析失败');
            return;
          }
          setResult(data);
        } catch (reason) {
          setError(String((reason && reason.message) || reason));
        } finally {
          setRunning(false);
          const id = widgetId.current;
          if (id !== null && window.turnstile) {
            try {
              window.turnstile.reset(id);
            } catch (_ignored) {
              /* widget already gone */
            }
          }
          setToken('');
        }
      }, [image, token]);

      const copyResult = useCallback(() => {
        const text = (result && (result.translated || result.original)) || '';
        if (!text) return;
        try {
          navigator.clipboard.writeText(text).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        } catch (_ignored) {
          setCopied(false);
        }
      }, [result]);

      const translatePaste = useCallback(async () => {
        const text = pasteText.trim();
        if (text === '') {
          setPasteError('请先粘贴英文分析结果');
          return;
        }
        setPasteBusy(true);
        setPasteError('');
        setPasteResult('');
        try {
          let translated = null;
          try {
            const response = await fetch(TRANSLATE_ENDPOINT, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text }),
            });
            if (response.ok) {
              const data = await response.json();
              if (data && data.ok === true && data.translated) translated = data.translated;
            }
          } catch (_ignored) {
            /* host route unavailable: fall through to the browser-side call */
          }
          if (!translated) {
            const direct = await translateDirect(text);
            if (direct) translated = formatSentences(direct);
          }
          if (!translated) {
            setPasteError('翻译服务暂时不可用，请稍后重试');
            return;
          }
          setPasteResult(translated);
        } catch (reason) {
          setPasteError(String((reason && reason.message) || reason));
        } finally {
          setPasteBusy(false);
        }
      }, [pasteText]);

      const copyPaste = useCallback(() => {
        if (!pasteResult) return;
        try {
          navigator.clipboard.writeText(pasteResult).then(
            () => setPasteCopied(true),
            () => setPasteCopied(false),
          );
        } catch (_ignored) {
          setPasteCopied(false);
        }
      }, [pasteResult]);

      const readClipboard = useCallback(async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text && text.trim() !== '') {
            setPasteText(text.trim());
            setPasteError('');
          } else {
            setPasteError('剪贴板是空的，请先在网页上复制分析结果');
          }
        } catch (reason) {
          setPasteError(
            '无法读取剪贴板（需要授权），也可以直接 Ctrl+V 粘贴：' +
              String((reason && reason.message) || reason),
          );
        }
      }, []);

      const header = h(
        'button',
        {
          type: 'button',
          className: 'ecgx-head',
          onClick: () => setOpen((value) => !value),
          'aria-expanded': open ? 'true' : 'false',
        },
        h('span', { className: 'ecgx-title' }, 'ECG-GPT 心电图分析'),
        h('span', { className: 'ecgx-hint' }, open ? '上传图片，或粘贴网站结果翻译' : '点开使用'),
        h('span', { className: 'ecgx-chev' }, open ? '▾' : '▸'),
      );

      if (!open) {
        return h('div', { className: 'ecgx-card' }, h('style', null, CSS), header);
      }

      const body = h(
        'div',
        { className: 'ecgx-body' },
        h(
          'div',
          { className: 'ecgx-row' },
          h(
            'div',
            {
              className: 'ecgx-drop',
              'data-ready': image ? '1' : '0',
              onClick: () => fileInput.current && fileInput.current.click(),
              onDragOver: (event) => event.preventDefault(),
              onDrop,
              role: 'button',
              tabIndex: 0,
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (fileInput.current) fileInput.current.click();
                }
              },
            },
            h('span', null, image ? '已选择图片' : '点击或拖拽心电图照片到此处'),
            h('span', { className: 'ecgx-filename' }, image ? image.name : '支持 JPG / PNG'),
          ),
          h('input', {
            ref: fileInput,
            type: 'file',
            accept: 'image/jpeg,image/png',
            style: { display: 'none' },
            onChange: onPick,
          }),
        ),
        h('div', { className: 'ecgx-ts', ref: widgetContainer }),
        turnstileError ? h('div', { className: 'ecgx-err' }, turnstileError) : null,
        h(
          'div',
          { className: 'ecgx-row' },
          h(
            'button',
            {
              type: 'button',
              className: 'ecgx-btn ecgx-btn--primary',
              disabled: running || !image || !token,
              onClick: analyze,
            },
            running ? '正在分析并翻译…' : '分析并翻译',
          ),
          h('span', { className: 'ecgx-note' }, '结果来自 ecg-gpt.cards-lab.org，仅供研究参考，不用于临床诊断。'),
        ),
        error ? h('div', { className: 'ecgx-err' }, error) : null,
        result
          ? h(
              'div',
              { className: 'ecgx-result' },
              h(
                'div',
                { className: 'ecgx-row' },
                h('span', { className: 'ecgx-label' }, '中文翻译'),
                h('button', { type: 'button', className: 'ecgx-btn', onClick: copyResult }, copied ? '已复制' : '复制'),
                result.translated
                  ? null
                  : h('span', { className: 'ecgx-err' }, '自动翻译失败，下方保留英文原文。'),
              ),
              h('div', { className: 'ecgx-zh' }, result.translated || '（未能翻译）'),
              h('span', { className: 'ecgx-label' }, '英文原文'),
              h('div', { className: 'ecgx-en' }, result.original || ''),
            )
          : null,
        h('div', { className: 'ecgx-divider' }),
        h(
          'div',
          { className: 'ecgx-row' },
          h('span', { className: 'ecgx-label' }, '粘贴翻译'),
          h(
            'button',
            {
              type: 'button',
              className: 'ecgx-btn',
              onClick: () => {
                if (typeof openSite === 'function') openSite(SITE_URL);
              },
            },
            '在右侧浏览器打开 ECG-GPT ↗',
          ),
        ),
        h('span', { className: 'ecgx-note' }, '在 ECG-GPT 网站分析后，复制 AI REPORT 那段文字，这里一键读取并翻译。'),
        h(
          'div',
          { className: 'ecgx-row' },
          h('button', { type: 'button', className: 'ecgx-btn', onClick: readClipboard }, '从剪贴板读取'),
          h('span', { className: 'ecgx-note' }, '先在网站页面按 Ctrl+C 复制结果，再点这里'),
        ),
        h('textarea', {
          className: 'ecgx-textarea',
          value: pasteText,
          placeholder: '把 ECG-GPT 返回的英文分析结果粘贴到这里…',
          onChange: (event) => setPasteText(event.target.value),
        }),
        h(
          'div',
          { className: 'ecgx-row' },
          h(
            'button',
            { type: 'button', className: 'ecgx-btn', disabled: pasteBusy, onClick: translatePaste },
            pasteBusy ? '翻译中…' : '翻译成中文',
          ),
          pasteResult
            ? h('button', { type: 'button', className: 'ecgx-btn', onClick: copyPaste }, pasteCopied ? '已复制' : '复制')
            : null,
        ),
        pasteError ? h('div', { className: 'ecgx-err' }, pasteError) : null,
        pasteResult ? h('div', { className: 'ecgx-zh' }, pasteResult) : null,
      );

      return h('div', { className: 'ecgx-card' }, h('style', null, CSS), header, body);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const openSite = (url) => {
          try {
            const sidebarRight = ctx.get('sidebarRight');
            if (sidebarRight && typeof sidebarRight.openTab === 'function') {
              sidebarRight.openTab('browser', { params: { url } });
              return;
            }
          } catch (_ignored) {
            /* fall through to a standalone tab */
          }
          try {
            window.open(url, '_blank', 'noopener,noreferrer');
          } catch (_ignored) {
            /* popup blocked */
          }
        };
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'ecg-gpt-translate',
              order: 5,
              inject: () => ({ openSite }),
            },
            EcgTranslate,
          ),
        );
      },
    };
  },
});
