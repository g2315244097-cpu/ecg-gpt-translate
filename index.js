/**
 * Host half of the ECG-GPT translation bundle.
 *
 * Registers two same-origin HTTP endpoints (served by the Harness web server):
 *   POST /ecg-gpt/analyze   — forward an uploaded ECG photo + Turnstile token to
 *                             https://ecg-gpt.cards-lab.org/, parse the returned
 *                             interpretation, translate it into Chinese.
 *   POST /ecg-gpt/translate — translate plain text the user pastes in (the
 *                             fallback when the site's Turnstile sitekey does not
 *                             allow this origin).
 *
 * Every registration is an effect on the plugin's context so stopping or
 * replacing the plugin removes its routes.
 */

const SITE_URL = 'https://ecg-gpt.cards-lab.org/';
const ANALYZE_PATH = '/ecg-gpt/analyze';
const TRANSLATE_PATH = '/ecg-gpt/translate';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_BODY_BYTES = 24 * 1024 * 1024;

export const inject = ['webServer'];

export function apply(ctx) {
  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error('请求体过大'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(new Error('请求体不是合法 JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  function sendJson(res, status, payload) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(payload));
  }

  function decodeEntities(text) {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&middot;/g, '·')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&hellip;/g, '…')
      .replace(/&quot;/g, '"')
      .replace(/&#0*39;|&#x27;/gi, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function htmlToText(html) {
    if (typeof html !== 'string' || html === '') return '';
    let text = html
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*p\s*>/gi, '\n')
      .replace(/<\s*\/\s*li\s*>/gi, '\n')
      .replace(/<\s*\/\s*div\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '');
    text = decodeEntities(text);
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n[ \t]+/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
  }

  function extractByClass(html, className) {
    const pattern = new RegExp(
      '<div[^>]*class="[^"]*\\b' + className + '\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/div>',
      'i',
    );
    const match = html.match(pattern);
    if (!match) return null;
    const text = htmlToText(match[1]);
    return text === '' ? null : text;
  }

  /** Translate with the agent's own default model; the most reliable route in a China network. */
  async function translateWithLlm(text) {
    const llm = ctx.get('llm');
    const defaultModel = ctx.get('agentDefaultModel');
    const selection =
      defaultModel && typeof defaultModel.currentSelection === 'function'
        ? defaultModel.currentSelection()
        : undefined;
    if (!llm || !selection || !selection.provider || !selection.model) return null;

    const stream = llm.stream({
      provider: selection.provider,
      model: selection.model,
      maxTokens: 2000,
      system:
        '你是资深心血管内科医师。用户会给你一段英文心电图（ECG）自动分析结果，通常是连续段落。' +
        '请把它改写成一份按临床重要性排序的中文结论清单。\n' +
        '硬性要求：\n' +
        '1. 只输出中文；不要出现英文、不要解释你的做法、不要任何前缀或后缀。\n' +
        '2. 把原文拆成一条条独立的发现，每条单独一行，行首写「N. 」（N 从 1 开始递增）。\n' +
        '3. 按临床风险从高到低排序：\n' +
        '   ① 急性或危重：急性心梗、显著的 ST 段抬高或压低、严重心律失常、高度房室阻滞、QT 显著延长；\n' +
        '   ② 主要异常：心室肥厚、束支阻滞、房颤/房扑、显著电轴偏移、心房扩大；\n' +
        '   ③ 次要异常：轻度 ST-T 改变、早期复极、低电压、非特异性改变；\n' +
        '   ④ 正常或阴性结论排在最后。\n' +
        '4. 同一部位的「表现 + 意义」合并为一行，不要拆开。\n' +
        '5. 不要编造原文没有的结论；原文未提及的不要补充。\n' +
        '6. 医学术语使用规范简体中文译名。',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text }],
        },
      ],
    });

    let out = '';
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        out += chunk.text;
      } else if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
        const message = chunk.reason.failure && chunk.reason.failure.message;
        throw new Error(message || '模型调用失败');
      }
    }
    out = out.trim();
    return out === '' ? null : out;
  }

  /** Keep a machine-translated fallback readable: one sentence per numbered line. */
  function formatSentences(text) {
    const parts = text
      .split(/(?<=[。！？；\n])/)
      .map((part) => part.trim())
      .filter((part) => part !== '');
    if (parts.length <= 1) return text;
    return parts.map((part, index) => index + 1 + '. ' + part).join('\n');
  }

  /** Findings an ECG-GPT report is built from; longest first so a prefix never wins. */
  const FINDINGS = [
    'SUPRAVENTRICULAR TACHYCARDIA',
    'VENTRICULAR TACHYCARDIA',
    'ATRIAL FIBRILLATION',
    'ATRIAL FLUTTER',
    'SINUS TACHYCARDIA',
    'SINUS BRADYCARDIA',
    'SINUS RHYTHM',
    'SINUS ARRHYTHMIA',
    'LEFT ANTERIOR FASCICULAR BLOCK',
    'LEFT POSTERIOR FASCICULAR BLOCK',
    'LEFT BUNDLE BRANCH BLOCK',
    'RIGHT BUNDLE BRANCH BLOCK',
    'FIRST DEGREE AV BLOCK',
    'SECOND DEGREE AV BLOCK',
    'THIRD DEGREE AV BLOCK',
    'LEFT VENTRICULAR HYPERTROPHY',
    'RIGHT VENTRICULAR HYPERTROPHY',
    'LEFT ATRIAL ENLARGEMENT',
    'RIGHT ATRIAL ENLARGEMENT',
    'LEFT AXIS DEVIATION',
    'RIGHT AXIS DEVIATION',
    'ANTERIOR INFARCTION',
    'INFERIOR INFARCTION',
    'LATERAL INFARCTION',
    'ST-T ABNORMALITIES',
    'ST ELEVATION',
    'ST DEPRESSION',
    'T WAVE INVERSION',
    'PROLONGED QTC',
    'PROLONGED QT',
    'SHORT QT',
    'NORMAL AXIS',
    'ABNORMAL ECG',
    'NORMAL ECG',
  ].sort((left, right) => right.length - left.length);

  const FINDING_RE = new RegExp(
    '(' + FINDINGS.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
    'g',
  );

  function splitFindings(text) {
    const upper = text.toUpperCase();
    const parts = upper.split(FINDING_RE);
    if (parts.length <= 1) return [];
    const findings = [];
    let buffer = '';
    for (const part of parts) {
      const token = part.trim();
      if (FINDINGS.includes(token)) {
        if (buffer.trim() !== '') findings.push(buffer.trim());
        buffer = token;
      } else {
        buffer += ' ' + part;
      }
    }
    if (buffer.trim() !== '') findings.push(buffer.trim());
    return findings
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => item.length > 2);
  }

  const SEVERITY = [
    [1, ['ST ELEVATION', 'VENTRICULAR TACHYCARDIA', 'THIRD DEGREE AV BLOCK', 'SECOND DEGREE AV BLOCK']],
    [
      2,
      [
        'ST DEPRESSION',
        'ISCHEMIA',
        'INFARCTION',
        'HYPERTROPHY',
        'BUNDLE BRANCH BLOCK',
        'FASCICULAR BLOCK',
        'ATRIAL FIBRILLATION',
        'ATRIAL FLUTTER',
        'AXIS DEVIATION',
        'ENLARGEMENT',
        'PROLONGED QTC',
        'SUPRAVENTRICULAR TACHYCARDIA',
        'TACHYCARDIA',
      ],
    ],
    [3, ['ST-T ABNORMALITIES', 'T WAVE INVERSION', 'PROLONGED QT', 'ABNORMAL ECG']],
    [4, ['SINUS RHYTHM', 'NORMAL AXIS', 'NORMAL ECG']],
  ];

  function severityOf(finding) {
    const upper = finding.toUpperCase();
    for (const [rank, words] of SEVERITY) {
      if (words.some((word) => upper.includes(word))) return rank;
    }
    return 3;
  }

  /** Fallback: a keyless public translation endpoint, raw text. */
  async function translateWithMyMemoryRaw(text) {
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

  async function translateWithMyMemory(text) {
    const raw = await translateWithMyMemoryRaw(text);
    return raw === null ? null : formatSentences(raw);
  }

  /**
   * Deterministic fallback: split the run-on English report into findings, rank them
   * by clinical severity, translate each, and emit one numbered line per finding.
   * Used when the model route is unavailable.
   */
  async function translateStructured(text) {
    const findings = splitFindings(text);
    if (findings.length < 2) return null;
    const ranked = findings
      .map((finding, index) => ({ finding, index, rank: severityOf(finding) }))
      .sort((left, right) => left.rank - right.rank || left.index - right.index);
    const lines = [];
    for (let index = 0; index < ranked.length; index += 1) {
      const item = ranked[index];
      let chinese = null;
      try {
        chinese = await translateWithMyMemoryRaw(item.finding);
      } catch (_ignored) {
        chinese = null;
      }
      lines.push(index + 1 + '. ' + (chinese || item.finding));
    }
    return lines.join('\n');
  }

  async function translate(text) {
    let llmError = null;
    try {
      const viaLlm = await translateWithLlm(text);
      if (viaLlm) return { text: viaLlm, via: 'llm', llmError: null };
    } catch (error) {
      llmError = error instanceof Error ? error.message : String(error);
      ctx.logger.warn('ecg-gpt-translate: LLM translation failed', error);
    }
    try {
      const structured = await translateStructured(text);
      if (structured) return { text: structured, via: 'mymemory-structured', llmError };
    } catch (error) {
      ctx.logger.warn('ecg-gpt-translate: structured fallback failed', error);
    }
    try {
      const viaPublic = await translateWithMyMemory(text);
      if (viaPublic) return { text: viaPublic, via: 'mymemory', llmError };
    } catch (error) {
      ctx.logger.warn('ecg-gpt-translate: public translation failed', error);
    }
    return { text: null, via: null, llmError };
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ANALYZE_PATH,
        handler: async (req, res) => {
          try {
            if (req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: '仅支持 POST' });
              return;
            }

            const body = await readJsonBody(req);
            const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
            const mimeType =
              typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/png';
            const filename =
              typeof body.filename === 'string' && body.filename ? body.filename : 'ecg.png';
            const turnstileToken =
              typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';

            if (imageBase64 === '') {
              sendJson(res, 400, { ok: false, error: '缺少心电图图片数据' });
              return;
            }
            if (turnstileToken === '') {
              sendJson(res, 400, { ok: false, error: '缺少人机验证令牌，请先完成 Turnstile 验证' });
              return;
            }

            const bytes = Buffer.from(imageBase64, 'base64');
            if (bytes.length === 0) {
              sendJson(res, 400, { ok: false, error: '图片数据为空' });
              return;
            }
            if (bytes.length > MAX_IMAGE_BYTES) {
              sendJson(res, 413, { ok: false, error: '图片过大（上限 12 MB）' });
              return;
            }

            const form = new FormData();
            form.append('file', new Blob([bytes], { type: mimeType }), filename);
            form.append('cf-turnstile-response', turnstileToken);

            const upstream = await fetch(SITE_URL, { method: 'POST', body: form });
            const html = await upstream.text();

            const prediction = extractByClass(html, 'prediction');
            if (!prediction) {
              const siteError = extractByClass(html, 'error-card');
              sendJson(res, 200, {
                ok: false,
                error:
                  siteError || '未从网站返回页面中解析到分析结果（通常说明人机验证未通过）',
              });
              return;
            }

            const { text: translated, via, llmError } = await translate(prediction);
            sendJson(res, 200, {
              ok: true,
              original: prediction,
              translated,
              translatedVia: via,
              llmError,
            });
          } catch (error) {
            sendJson(res, 200, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      }),
    'ecg-gpt-translate: analyze route',
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: TRANSLATE_PATH,
        handler: async (req, res) => {
          try {
            if (req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: '仅支持 POST' });
              return;
            }
            const body = await readJsonBody(req);
            const text = typeof body.text === 'string' ? body.text.trim() : '';
            if (text === '') {
              sendJson(res, 400, { ok: false, error: '缺少待翻译文本' });
              return;
            }
            if (text.length > 20000) {
              sendJson(res, 413, { ok: false, error: '文本过长（上限 20000 字符）' });
              return;
            }
            const { text: translated, via, llmError } = await translate(text);
            sendJson(res, 200, { ok: true, translated, translatedVia: via, llmError });
          } catch (error) {
            sendJson(res, 200, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      }),
    'ecg-gpt-translate: translate route',
  );
}
