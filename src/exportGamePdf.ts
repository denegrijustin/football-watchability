/** A searchable, single-page report of everything in the expanded card. */
export async function downloadGameReport(card: HTMLElement, title: string, date: string) {
  const [{ jsPDF }, { toPng }] = await Promise.all([import("jspdf"), import("html-to-image")]);
  const clone = card.cloneNode(true) as HTMLElement;
  clone.style.cssText = "position:fixed;left:-20000px;top:0;width:1000px;pointer-events:none";
  clone.querySelectorAll("button,.sr-only").forEach(el => el.remove());
  clone.querySelectorAll("[aria-hidden='true']").forEach(el => { if (el.textContent?.trim() === "+") el.remove(); });
  clone.querySelectorAll("details").forEach(el => el.open = true);
  document.body.append(clone);
  clone.querySelectorAll("span,strong,small").forEach(el => {
    if (el.closest("svg")) return;
    el.before(document.createTextNode(" ")); el.after(document.createTextNode(" "));
  });
  const clean = (text: string) => text.replace(/[–—−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[…]/g,"...").replace(/[•·]/g," | ").replace(/[^\x20-\x7e\xa0-\xff\n\t]/g, "").replace(/[ \t]+/g," ").trim();
  type Asset = { data: string; width: number; height: number; chart: boolean };
  type Section = { heading: string; text: string; assets: Asset[] };
  try {
    await Promise.all(Array.from(clone.querySelectorAll("img")).map(img => {
      img.loading = "eager";
      return img.decode().catch(() => undefined);
    }));
    const blocks: HTMLElement[] = [];
    const visit = (el: HTMLElement) => {
      if (el.matches(".card-more,.game-details")) Array.from(el.children).forEach(child => visit(child as HTMLElement));
      else if (el.innerText.trim() || el.querySelector("img,svg")) blocks.push(el);
    };
    Array.from(clone.children).forEach(el => visit(el as HTMLElement));
    const sections: Section[] = [];
    let missing = 0;
    for (const block of blocks) {
      const assets: Asset[] = [];
      const images = Array.from(block.querySelectorAll("img,svg"));
      for (const image of images) {
        try {
          const box = image.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          let data: string;
          if (image instanceof SVGElement) {
            const svg = image.cloneNode(true) as SVGElement;
            const originals = [image, ...Array.from(image.querySelectorAll("*"))];
            const copies = [svg, ...Array.from(svg.querySelectorAll("*"))];
            originals.forEach((node, i) => {
              const style = getComputedStyle(node);
              for (const property of ["fill", "stroke", "stroke-width", "font-family", "font-size", "font-weight", "color"]) {
                (copies[i] as SVGElement).style.setProperty(property, style.getPropertyValue(property));
              }
            });
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            svg.setAttribute("width", String(box.width)); svg.setAttribute("height", String(box.height));
            const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
            try {
              const bitmap = new Image(); bitmap.src = url; await bitmap.decode();
              const canvas = document.createElement("canvas"); canvas.width = Math.ceil(box.width * 2); canvas.height = Math.ceil(box.height * 2);
              canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              data = canvas.toDataURL("image/png");
            } finally { URL.revokeObjectURL(url); }
          } else data = await toPng(image as HTMLElement, { pixelRatio: 2, fontEmbedCSS: "", cacheBust: false });
          assets.push({ data, width: box.width, height: box.height, chart: image.tagName.toLowerCase() === "svg" });
        } catch { missing++; }
      }
      // Keep tables' columns intelligible in the printable text.
      block.querySelectorAll("tr").forEach(row => {
        const text = Array.from(row.cells).map(cell => cell.innerText.trim()).join(" | ");
        row.replaceWith(Object.assign(document.createElement("p"), { textContent: text }));
      });
      const headingEl = (block as Element).matches(".matchup") ? null : block.querySelector<HTMLElement>("summary,h3,h4,caption");
      const heading = clean(headingEl?.innerText.trim().split("\n")[0] || ((block as Element).matches("header") ? "Kickoff & broadcast" : (block as Element).matches(".matchup") ? "Matchup & watchability" : (block as Element).matches(".facts") ? "Venue, line, announcers & weather" : (block as Element).matches(".take") ? "Commentary" : "Game detail")).slice(0, 60);
      const text = clean(block.innerText).replace(/\s*\n\s*/g, " | ");
      if (text || assets.length) sections.push({ heading, text, assets });
    }
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3", compress: true });
    pdf.setProperties({ title: `${title} - game report`, subject: "Football Watchability game details", creator: "FBWatch" });
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), margin = 28, gap = 16, cols = 3, cw = (W - margin * 2 - gap * (cols - 1)) / cols;
    const top = 76, bottom = H - 34;
    let font = 10;
    type Layout = { section: Section; x: number; y: number; lines: string[]; height: number };
    let layout: Layout[] = [];
    for (;;) {
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(font);
      const heights = Array(cols).fill(top);
      layout = sections.map(section => {
        const lines = pdf.splitTextToSize(section.text, cw - 12) as string[];
        const pictures = section.assets.filter(a => !a.chart);
        const charts = section.assets.filter(a => a.chart);
        const imageHeight = pictures.length ? Math.ceil(pictures.length / 6) * 30 + 4 : 0;
        const chartHeight = charts.reduce((sum, a) => sum + Math.min(72, (cw - 12) * a.height / a.width) + 4, 0);
        const height = 22 + lines.length * font * 1.15 + imageHeight + chartHeight;
        const col = heights.indexOf(Math.min(...heights));
        const item = { section, x: margin + col * (cw + gap), y: heights[col], lines, height };
        heights[col] += height + 8;
        return item;
      });
      if (Math.max(...heights) <= bottom || font <= 5) break;
      font -= .25;
    }
    // Very data-rich cards use a larger single sheet, preserving the same font size.
    const contentBottom = Math.max(...layout.map(item => item.y + item.height));
    if (contentBottom > bottom) {
      const newHeight = contentBottom + 34;
      pdf.deletePage(1); pdf.addPage([W, newHeight], newHeight > W ? "portrait" : "landscape");
    }
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.setFillColor(12, 26, 39); pdf.rect(0, 0, W, 62, "F");
    pdf.setTextColor(255,255,255); pdf.setFont("helvetica","bold"); pdf.setFontSize(18);
    pdf.text(clean(title), margin, 29, { maxWidth: W - margin * 2 });
    pdf.setFontSize(9); pdf.setFont("helvetica","normal");
    pdf.text(`GAME REPORT | ${clean(new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }))} | Football Watchability`, margin, 48);
    for (const { section, x, y, lines, height } of layout) {
      pdf.setFillColor(245,247,249); pdf.roundedRect(x, y, cw, height, 4, 4, "F");
      pdf.setTextColor(18,47,66); pdf.setFont("helvetica","bold"); pdf.setFontSize(font + 1);
      pdf.text(section.heading, x + 6, y + 12, { maxWidth: cw - 12 });
      let cursor = y + 19;
      const pictures = section.assets.filter(a => !a.chart);
      pictures.forEach((a, i) => {
        const size = Math.min(28 / a.width, 26 / a.height);
        pdf.addImage(a.data,"PNG", x + 6 + (i % 6) * 36, cursor + Math.floor(i / 6) * 30, a.width * size, a.height * size);
      });
      if (pictures.length) cursor += Math.ceil(pictures.length / 6) * 30 + 4;
      pdf.setFont("helvetica","normal"); pdf.setFontSize(font); pdf.setTextColor(28,35,42);
      pdf.text(lines, x + 6, cursor + font, { lineHeightFactor: 1.15 });
      cursor += lines.length * font * 1.15;
      for (const a of section.assets.filter(a => a.chart)) {
        const h = Math.min(72, (cw - 12) * a.height / a.width);
        pdf.addImage(a.data,"PNG",x + 6,cursor + 4,h * a.width / a.height,h); cursor += h + 4;
      }
    }
    pdf.setTextColor(90,100,110); pdf.setFontSize(7);
    pdf.text(`fbwatch.elskatemm.com | Exported ${new Date().toLocaleString()}${missing ? ` | ${missing} unavailable image(s)` : ""}`, margin, pageHeight - 14);
    pdf.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}-${date.slice(0,10)}-game-report.pdf`);
  } finally { clone.remove(); }
}
