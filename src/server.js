const express = require('express');
const cors = require('cors');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

try {
  registerFont('./fonts/NotoSansSC-Regular.otf', { family: 'Noto Sans SC' });
} catch (e) {
  console.warn('字体未注册：如需要中文更好显示，请在 ./fonts 放入 NotoSansSC-Regular.otf');
}

const PORT = 3001;
const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return;
  const lines = String(text).split(/\n+/);
  for (const line of lines) {
    let currentLine = '';
    for (const word of line.split(/(\s+)/)) {
      const testLine = currentLine + word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        ctx.fillText(currentLine, x, y);
        y += lineHeight;
        currentLine = word.trim();
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      ctx.fillText(currentLine, x, y);
      y += lineHeight;
    }
  }
}

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

app.post('/render', async (req, res) => {
  try {
    const body = req.body;

    const name = body.name || '';
    const nomber = body.Nomber || body.number || '';
    const copyright = body.copyright || '';
    const note = body.note || body.add || '';

    const tags = Array.isArray(body.tags)
      ? body.tags
      : String(body.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);

    const chance1 = body.option1?.chance_1 || '';
    const chance2 = body.option1?.chance_2 || '';

    const dm1 = body.option1?.description_mode_1 || '';
    const cost1 = body.option1?.cost_1 || '';
    const desc1 = body.description_1 || '';

    const extraDm1 = body.option1?.extra_description_1_mode || '';
    const extraCost1 = body.option1?.cost_extra_1 || '';
    const extraDesc1 = body.option1?.extra_description_1 || '';

    const dm2 = body.option1?.description_mode_2 || '';
    const cost2 = body.option1?.cost_2 || '';
    const desc2 = body.description_2 || '';

    const extraDm2 = body.option1?.extra_description_2_mode || '';
    const extraCost2 = body.option1?.cost_extra_2 || '';
    const extraDesc2 = body.option1?.extra_description_2 || '';

    const W = 885, H = 1290;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    // ===== 左上角 tags 图标 =====
    let tagX = 30, tagY = 20;
    for (const tag of tags) {
      try {
        const filePath = path.join(__dirname, 'icon', `${tag}.png`);
        console.log('Loading tag icon:', filePath);
        const iconImg = await loadImage(filePath);
        ctx.drawImage(iconImg, tagX, tagY, 48, 48);
        tagX += 56;
      } catch (err) {
        console.warn(`Tag icon not found: ${tag}`, err.message);
      }
    }

    // ===== 中间插图 =====
    const artX = 60, artY = 100, artW = W - 120, artH = 400;
    ctx.save();
    roundRect(ctx, artX, artY, artW, artH, 16);
    ctx.clip();
    if (body.art && typeof body.art === 'string' && body.art.startsWith('data:image/')) {
      try {
        const img = await loadImage(body.art);
        const scale = Math.min(artW / img.width, artH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        ctx.drawImage(img, artX + (artW - drawW) / 2, artY + (artH - drawH) / 2, drawW, drawH);
      } catch {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(artX, artY, artW, artH);
      }
    } else {
      ctx.fillStyle = '#eee';
      ctx.fillRect(artX, artY, artW, artH);
    }
    ctx.restore();

    ctx.fillStyle = '#000';
    ctx.font = 'bold 36px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, W / 2, artY + artH + 50);

    ctx.textAlign = 'left';
    ctx.font = '16px "Noto Sans SC", sans-serif';
    let currentY = artY + artH + 80;
    if (chance1) {
      drawWrappedText(ctx, chance1, 60, currentY, W - 120, 24);
      currentY += 40;
    }

    // ===== 绘制效果函数（带调试输出） =====
    const drawEffect = async (iconName, cost, text) => {
      let x = 60;
      if (iconName) {
        try {
          const filePath = path.join(__dirname, 'icon', `${iconName}.png`);
          console.log('Loading effect icon:', filePath);
          const effIcon = await loadImage(filePath);
          ctx.drawImage(effIcon, x, currentY, 40, 40);
        } catch (err) {
          console.warn(`Effect icon not found: ${iconName}`, err.message);
        }
      }
      x += 50;
      if (cost) {
        ctx.fillStyle = '#000';
        ctx.font = 'bold 28px "Noto Sans SC", sans-serif';
        ctx.fillText(cost, x, currentY + 28);
        x += 50;
      }
      ctx.fillStyle = '#000';
      ctx.font = '16px "Noto Sans SC", sans-serif';
      drawWrappedText(ctx, text || '', x, currentY + 24, W - x - 60, 24);
      currentY += 70;
    };

    await drawEffect(dm1, cost1, desc1);
    await drawEffect(extraDm1, extraCost1, extraDesc1);

    if (chance2) {
      drawWrappedText(ctx, chance2, 60, currentY, W - 120, 24);
      currentY += 40;
    }

    await drawEffect(dm2, cost2, desc2);
    await drawEffect(extraDm2, extraCost2, extraDesc2);

    ctx.fillStyle = '#666';
    ctx.font = '12px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(copyright, 60, H - 30);
    ctx.textAlign = 'right';
    ctx.fillText(nomber, W - 30, H - 30);

    const png = canvas.toBuffer('image/png');
    res.set('Content-Type', 'image/png');
    res.send(png);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '渲染失败', error: String(err.message || err) });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Render server listening on http://localhost:${PORT}`);
});
