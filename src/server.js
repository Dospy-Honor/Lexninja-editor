const express = require('express');
const cors = require('cors');
const { createCanvas, loadImage, registerFont } = require('canvas');

// 1) 可选：注册中文字体（确保项目有该文件）
try {
  registerFont('./fonts/NotoSansSC-Regular.otf', { family: 'Noto Sans SC' });
} catch (e) {
  console.warn('字体未注册：如需要中文更好显示，请在 ./fonts 放入 NotoSansSC-Regular.otf');
}

// 2) 常量配置
const PORT = 3001;
const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' })); // base64 图片较大，放宽限制

// 3) 工具：字段规范化
function normalizePayload(body) {
  // 前端模板类型（预留），兼容 body.type 既可能是 'lexla' 也可能是选项值
  const templateType = body.type === 'lexla' ? 'lexla' : (body.template || 'lexla');

  // 兼容 category / type（当 type 是选项时才认为它是类别）
  const optionMap = { option1: '忍术', option2: '忍者', option3: '状态' };
  let category =
    body.category ||
    (['忍术', '忍者', '状态'].includes(body.type) ? body.type : null) ||
    (optionMap[body.type] || null) ||
    body.cardType || body.kind || ''; // 多兜底

  // 兼容 Nomber / number
  const number = body.Nomber || body.number || '';

  // 兼容 tags 为字符串或数组
  const tags = Array.isArray(body.tags)
    ? body.tags.filter(Boolean)
    : String(body.tags || '')
        .split(/[,，]/)
        .map(s => s.trim())
        .filter(Boolean);

  // 组装描述（支持 option1 细节）
  const ability1 = [];
  if (body.option1?.chance_1) ability1.push(`${body.option1.chance_1}`);    //chance_1
  if (body.option1?.description_mode_1 || body.option1?.cost_1) {
    const mode = body.option1.description_mode_1 ? `${body.option1.description_mode_1}` : '';  //种类
    const cost = body.option1.cost_1 ? `${body.option1.cost_1}` : '';    //cost
    ability1.push([mode, cost].filter(Boolean).join(' · '));
  }
  if (body.description_1) ability1.push(body.description_1);
  if (body.option1?.extra_description_1 || body.option1?.extra_description_1_mode || body.option1?.cost_extra_1) {
    const extraMeta = [
      body.option1.extra_description_1_mode ? `${body.option1.extra_description_1_mode}` : '',    //种类
      body.option1.cost_extra_1 ? `${body.option1.cost_extra_1}` : ''    //cost
    ]
      .filter(Boolean)
      .join(' · ');
    const extraText = body.option1.extra_description_1 ? body.option1.extra_description_1 : '';
    ability1.push(['', extraMeta].filter(Boolean).join(' ') + (extraText ? `\n${extraText}` : ''));
  }  //追加

  const ability2 = [];
  if (body.option1?.chance_2) ability2.push(`${body.option1.chance_2}`);
  if (body.option1?.cost_2) ability2.push(`${body.option1.cost_2}`);
  if (body.description_2) ability2.push(body.description_2);
  if (body.option1?.extra_description_2 || body.option1?.extra_description_2_mode || body.option1?.cost_extra_2) {
    const extraMeta = [
      body.option1.extra_description_2_mode ? `${body.option1.extra_description_2_mode}` : '',
      body.option1.cost_extra_2 ? `${body.option1.cost_extra_2}` : ''
    ]
      .filter(Boolean)
      .join(' · ');
    const extraText = body.option1.extra_description_2 ? body.option1.extra_description_2 : '';
    ability2.push(['', extraMeta].filter(Boolean).join(' ') + (extraText ? `\n${extraText}` : ''));
  }

  return {
    templateType,
    category,
    name: body.name || '',
    number,
    tags,
    art: body.art || '',
    note: body.add || body.note || '',
    copyright: body.copyright || '',
    ability1: ability1.filter(Boolean).join('\n'),
    ability2: ability2.filter(Boolean).join('\n')
  };
}

// 4) 工具：主题色推断
function guessTheme({ category, tags }) {
  const t = (category || '').trim();
  const has = (k) => tags.some(tag => tag.toLowerCase() === k);
  if (t.includes('忍术')) return { bg: '#ffffffff', accent: '#ffffffff' };
  if (t.includes('忍者')) return { bg: '#ffffffff', accent: '#ffffffff' };
  if (t.includes('状态')) return { bg: '#ffffffff', accent: '#ffffffff' };
  return { bg: '#ffffffff', accent: '#ffffffff' };
}

// 5) 工具：文本换行
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  if (!text) return 0;
  const paragraphs = String(text).split(/\n+/);
  let lineCount = 0;
  for (const p of paragraphs) {
    const words = p.split(/(\s+)/); // 保留空白分隔
    let line = '';
    for (const w of words) {
      const test = line + w;
      const wlen = ctx.measureText(test).width;
      if (wlen > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = w.trimStart();
        lineCount++;
        if (lineCount >= maxLines) return lineCount;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lineCount++;
      if (lineCount >= maxLines) return lineCount;
    }
  }
  return lineCount;
}

// 6) 工具：圆角矩形
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// 7) 渲染端点
app.post('/render', async (req, res) => {
  try {
    const data = normalizePayload(req.body);

    // 校验与限制
    if (!data.name) {
      return res.status(400).json({ message: '缺少必填字段：name' });
    }
    if (!data.art) {
      // 允许无插画，但也可以改为强制
      // return res.status(400).json({ message: '缺少插画 art' });
    }
    if (typeof data.art === 'string' && data.art.length > 12 * 1024 * 1024) {
      return res.status(413).json({ message: '插画数据过大' });
    }

    // 画布尺寸（可按模板调整）
    const W = 885;
    const H = 1290;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.antialias = 'subpixel';
    ctx.textDrawingMode = 'path';

    // 背景
    const theme = guessTheme({ category: data.category, tags: data.tags });
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, theme.bg);
    grad.addColorStop(1, '#ffffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 边框

    // 标题
    ctx.fillStyle = theme.accent;
    ctx.fillRect(0, 0, W, 72);

    ctx.fillStyle = '#000000ff';
    ctx.font = 'bold 36px "Noto Sans SC", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const P = 443 - data.name.length*36/2;
    ctx.fillText(data.name, P, 655);

    // 编号
    ctx.font = '16px "Noto Sans SC", system-ui, sans-serif';
    ctx.textAlign = 'right';
    const catText = data.category ? `` : '';
    const numText = data.number ? `${data.number}` : '';
    const rightMeta = [catText, numText].filter(Boolean).join('  ·  ');
    ctx.fillText(rightMeta, W - 24, 1246);
    ctx.textAlign = 'left';

    // 插画区域
    const artX = 40;
    const artY = 96;
    const artW = W - 80;
    const artH = 540;

    ctx.save();
    roundRect(ctx, artX, artY, artW, artH, 16);
    ctx.clip();
    ctx.fillStyle = '#222';
    ctx.fillRect(artX, artY, artW, artH);

    if (data.art && typeof data.art === 'string' && data.art.startsWith('data:image/')) {
      try {
        const img = await loadImage(data.art);
        // 等比缩放适配裁切区域
        const scale = Math.min(artW / img.width, artH / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        const dx = artX + Math.round((artW - drawW) / 2);
        const dy = artY + Math.round((artH - drawH) / 2);
        ctx.drawImage(img, dx, dy, drawW, drawH);
      } catch (e) {
        // 占位提示
        ctx.fillStyle = '#555';
        ctx.font = 'italic 18px "Noto Sans SC", system-ui, sans-serif';
        ctx.fillText('插画加载失败', artX + 16, artY + 28);
      }
    } else {
      // 无插画占位
      ctx.strokeStyle = '#555';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(artX + 8, artY + 8, artW - 16, artH - 16);
      ctx.setLineDash([]);
      ctx.fillStyle = '#777';
      ctx.font = 'italic 18px "Noto Sans SC", system-ui, sans-serif';
      ctx.fillText('无插画', artX + 16, artY + 28);
    }
    ctx.restore();

    // 描述区域
    const pad = 32;
    const contentX = pad;
    let contentY = artY + artH + 24;
    const contentW = W - pad * 2;
    const lh = 26;

    // 标签
    if (data.tags.length) {
      let x = contentX;
      const y = contentY;
      ctx.font = '14px "Noto Sans SC", system-ui, sans-serif';
      for (const tag of data.tags) {
        const label = `#${tag}`;
        const tw = ctx.measureText(label).width;
        const chipW = tw + 18;
        ctx.fillStyle = '#ffffffff';
        roundRect(ctx, x, y, chipW, 24, 12);
        ctx.fill();
        ctx.fillStyle = '#000000ff';
        ctx.fillText(label, x + 9, y + 16);
        x += chipW + 8;
        if (x > contentX + contentW - 120) { // 简单换行
          x = contentX;
          contentY += 32;
        }
      }
      contentY += 40;
    }

    // 能力 1
    if (data.ability1) {
      ctx.fillStyle = theme.accent;
      ctx.font = 'bold 18px "Noto Sans SC", system-ui, sans-serif';
      ctx.fillText( contentX, contentY);
      contentY += 12;
      ctx.fillStyle = '#000000ff';
      ctx.font = '16px "Noto Sans SC", system-ui, sans-serif';
      contentY += lh;
      drawWrappedText(ctx, data.ability1, contentX, contentY, contentW, lh);
      // 行数不返回 y，这里粗略下移
      contentY += Math.ceil(ctx.measureText(data.ability1).width / contentW) * lh + 12;
    }

    // 能力 2
    if (data.ability2) {
      ctx.fillStyle = theme.accent;
      ctx.font = 'bold 18px "Noto Sans SC", system-ui, sans-serif';
      ctx.fillText( contentX, contentY);
      contentY += 12;
      ctx.fillStyle = '#000000ff';
      ctx.font = '16px "Noto Sans SC", system-ui, sans-serif';
      contentY += lh;
      drawWrappedText(ctx, data.ability2, contentX, contentY, contentW, lh);
      contentY += Math.ceil(ctx.measureText(data.ability2).width / contentW) * lh + 12;
    }

    // 底部版权/注释
    ctx.fillStyle = '#313132ff';
    ctx.font = '12px "Noto Sans SC", system-ui, sans-serif';
    const meta = [data.note, data.copyright].filter(Boolean).join('  ·  ');
    drawWrappedText(ctx, meta, contentX, H - 56, contentW, 18, 3);

    // 输出 PNG
    const png = canvas.toBuffer('image/png');
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '渲染失败', error: String(err && err.message || err) });
  }
});

// 8) 健康检查
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Render server listening on http://localhost:${PORT}`);
});
