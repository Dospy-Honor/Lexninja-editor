const API = 'http://localhost:3001/render';

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById('cardForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = '渲染中…';

  try {
    const fd = new FormData(e.currentTarget);

    // 读取插画文件为 base64
    const file = document.getElementById('artFile').files[0];
    let artDataURL = '';
    if (file) {
      if (file.type !== 'image/png') {
        alert('请上传 PNG 图片');
        submitBtn.disabled = false;
        submitBtn.textContent = '生成并渲染';
        return;
      }
      artDataURL = await readFileAsDataURL(file);
    } else {
      // 如果允许无插画，保留空字符串；不允许就直接提示
      // alert('请上传插画 PNG'); return;
      artDataURL = '';
    }

    // 建议给 select 添加 name="category"
    const json = {
      language: 'zh_CN',
      type: 'lexla',                  // 保留你的模板类型
      category: fd.get('type') || '',  // 新增：来自 <select name="type">
      name: fd.get('name') || '',
      tags: (fd.get('tags') || '')
        .split(/[,，]/)              // 支持中文逗号
        .map(s => s.trim())
        .filter(Boolean),
      // 将你已有的核心文本带上
      description_1: (fd.get('description_1') || '').trim(),
      description_2: (fd.get('description_2') || '').trim(),
      Nomber: (fd.get('Nomber') || '').trim(), // 如果是 Number 建议统一 key
      // 可选：把 option1 的细节也收集起来（后端再决定用不用）
      option1: {
        chance_1: (fd.get('chance_1') || '').trim(),
        description_mode_1: (fd.get('description_mode_1') || '').trim(),
        cost_1: (fd.get('cost_1') || '').trim(),
        extra_description_1_mode: (fd.get('extra_description_1_mode') || '').trim(),
        cost_extra_1: (fd.get('cost_extra_1') || '').trim(),
        extra_description_1: (fd.get('extra_description_1') || '').trim(),
        chance_2: (fd.get('chance_2') || '').trim(),
        cost_2: (fd.get('cost_2') || '').trim(),
        extra_description_2_mode: (fd.get('extra_description_2_mode') || '').trim(),
        cost_extra_2: (fd.get('cost_extra_2') || '').trim(),
        extra_description_2: (fd.get('extra_description_2') || '').trim(),
      },
      art: artDataURL,
      add: (fd.get('add') || '').trim(),
      copyright: (fd.get('copyright') || '').trim()
    };

    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json)
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      alert('渲染失败：' + (err.message || res.status));
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;

    const result = document.getElementById('result');
    result.innerHTML = '';
    result.appendChild(img);

    const a = document.getElementById('download');
    a.href = url;
    a.style.display = 'inline-block';

    // 可选：延迟释放 URL
    // setTimeout(()=> URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    console.error(err);
    alert('渲染过程出现异常，请稍后重试');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '生成并渲染';
  }
});