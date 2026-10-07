import { getTz } from "./tz";
/** A one-page portrait scouting card with visual trends and player portraits. */
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
  type Section = { heading: string; text: string; assets: Asset[]; key: string };
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
      if (text || assets.length) sections.push({ heading, text, assets, key: block.className });
    }
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
    pdf.setProperties({ title: `${title} - game report`, subject: "Visual game scouting report", creator: "FBWatch" });
    const W = 612, M = 24, CW = W - M * 2;
    const text = (value: string, x: number, y: number, width: number, size = 9, maxLines = 2, bold = false, white = false) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size);
      pdf.setTextColor(...(white ? [255,255,255] : [28,40,53]) as [number,number,number]);
      let lines = pdf.splitTextToSize(clean(value).replace(/\s+/g, " "), width) as string[];
      if (lines.length > maxLines) { lines = lines.slice(0,maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, "") + "..."; }
      pdf.text(lines, x, y, { lineHeightFactor: 1.2 });
    };
    const image = (asset: Asset | undefined, x: number, y: number, w: number, h: number) => {
      if (!asset) return;
      const scale = Math.min(w / asset.width,h / asset.height);
      pdf.addImage(asset.data,"PNG",x + (w - asset.width * scale)/2,y + (h - asset.height * scale)/2,asset.width * scale,asset.height * scale);
    };
    const box = (x: number,y: number,w: number,h: number,label: string) => {
      pdf.setFillColor(242,245,248); pdf.roundedRect(x,y,w,h,8,8,"F");
      text(label.toUpperCase(),x+12,y+19,w-24,9,1,true);
    };
    const find = (key: string) => sections.find(section => section.key.includes(key));
    const teamNodes = Array.from(card.querySelectorAll<HTMLElement>(".team-heading,.ls-team"));
    const teams = teamNodes.map(node => ({ name: clean(node.querySelector("h4,.ls-name")?.textContent || node.innerText).replace(/Home$/, ""), record: clean(node.querySelector(".record,.ls-rec,p")?.textContent || ""), rank: clean(node.querySelector(".rank-line")?.textContent || "") }));
    const matchup = find("matchup") || find("final-board") || sections.find(section => section.assets.some(asset => !asset.chart) && section.text.includes("FINAL"));
    const teamAssets = (matchup?.assets || []).filter(asset => !asset.chart);
    const rgb = getComputedStyle(card).backgroundColor.match(/\d+/g)?.map(Number);
    pdf.setFillColor(...(rgb && rgb.length >= 3 ? rgb.slice(0,3) : [15,35,55]) as [number,number,number]);
    pdf.roundedRect(M,M,CW,190,12,12,"F");
    text("FBWATCH  /  GAME REPORT",M+16,45,CW-32,9,1,true,true);
    text(sections[0]?.text || new Date(date).toLocaleDateString(),M+16,63,CW-110,9,1,false,true);
    pdf.setFillColor(244,247,250); pdf.roundedRect(W-M-82,34,68,32,6,6,"F");
    image(sections[0]?.assets[0],W-M-78,38,60,24);
    const names = title.split(/\s+@\s+/);
    for (let i=0;i<2;i++) {
      image(teamAssets[i],M+14,79+i*50,38,38);
      text(names[i] || teams[i]?.name || title,M+62,96+i*50,CW-155,15,1,true,true);
      text([teams[i]?.record,teams[i]?.rank].filter(Boolean).join(" | "),M+62,113+i*50,CW-155,8,1,false,true);
    }
    const rating = card.querySelector(".score strong,.fva-box.actual strong")?.textContent?.trim() || "-";
    pdf.setFillColor(182,224,118); pdf.roundedRect(W-M-94,83,76,76,10,10,"F");
    text(rating,W-M-84,120,56,30,1,true);
    text("WATCH SCORE",W-M-86,144,64,7,1,true);
    const facts = find("facts");
    text(facts?.text || card.querySelector(".attendance")?.textContent || "",M+16,181,CW-32,8,2,false,true);
    const chartSection = find("season-trends") || sections.find(section => /Season trends/i.test(section.heading)) || find("insanity");
    const charts = chartSection?.assets.filter(asset => asset.chart) || sections.flatMap(section => section.assets.filter(asset => asset.chart)).slice(0,2);
    box(M,226,CW,168,card.classList.contains("result-card") ? "Game momentum & trends" : "Season trends - scoring margin");
    charts.slice(0,2).forEach((asset,i) => {
      text(names[i] || teams[i]?.name || "Win probability",M+14+i*(CW/2),264,CW/2-28,10,1,true);
      image(asset,M+14+i*(CW/2),274,charts.length === 1 ? CW-28 : CW/2-28,90);
    });
    if (!charts.length) text("Trend chart unavailable for this game",M+14,282,CW-28,11);
    text(card.classList.contains("result-card") ? "Win probability through the game. Momentum data from ESPN." : "Blue: positive margin  |  Red: negative margin. Season results from ESPN.",M+14,382,CW-28,7,1);
    box(M,406,CW,178,card.querySelector(".kp-card") ? "Players to watch" : "Final score & quarter-by-quarter");
    const playerNodes = Array.from(card.querySelectorAll<HTMLElement>(".kp-card"));
    const portraits = sections.find(section => /History.*players/i.test(section.heading))?.assets.filter(asset => !asset.chart) || [];
    playerNodes.slice(0,8).forEach((player,i) => {
      const x=M+12+(i%4)*(CW-24)/4, y=438+Math.floor(i/4)*70;
      // History's image order follows the player cards, including tiny team logos.
      const photos = portraits.filter(asset => asset.height >= 30 && asset.width >= 30);
      image(photos[i],x,y,42,42);
      text(player.querySelector(".kp-text strong")?.innerHTML.replace(/<[^>]*>/g, " ") || "Player",x+47,y+12,(CW-24)/4-52,8,2,true);
      text(player.querySelector(".kp-team-line")?.textContent || "",x+47,y+33,(CW-24)/4-52,6.5,2);
      text(player.querySelector("small")?.textContent || "",x,y+54,(CW-24)/4-8,7,1);
    });
    if (!playerNodes.length) {
      const rows = Array.from(card.querySelectorAll<HTMLTableRowElement>(".linescore tbody tr"));
      rows.forEach((row,i) => {
        const y=440+i*64;
        image(teamAssets[i],M+14,y-12,32,32);
        text(names[i] || teams[i]?.name || "Team",M+56,y+1,220,12,1,true);
        text(row.querySelector(".ls-total")?.textContent || "",M+56,y+23,100,22,1,true);
        const quarters=Array.from(row.querySelectorAll("td")).map(td=>Number(td.textContent)||0);
        quarters.forEach((points,q) => {
          const x=M+270+q*50;
          pdf.setFillColor(i===0 ? 223 : 53,i===0 ? 94 : 130,i===0 ? 103 : 211);
          pdf.rect(x,y+22-points*1.5,28,Math.max(1,points*1.5),"F");
          text(`Q${q+1}: ${points}`,x-2,y+36,46,7,1);
        });
      });
      if (!rows.length) text("Player portraits unavailable in the saved game data.",M+14,456,CW-28,11,2);
    }
    const half=(CW-12)/2;
    box(M,596,half,144,"Matchup outlook"); box(M+half+12,596,half,144,"Why watch");
    const projected = card.querySelector<HTMLElement>(".proj summary strong,.sc-box strong")?.innerText || "Projection unavailable";
    text("PROJECTED SCORE",M+12,629,half-24,8,1);
    text(projected.replace(/-\s*to\s*/g, " - "),M+12,654,half-24,19,1,true);
    const winRow = card.querySelector(".pwp-row");
    const awayWin = winRow?.querySelector(".pwp-val.away")?.textContent || "";
    const homeWin = winRow?.querySelector(".pwp-val.home")?.textContent || "";
    if (winRow) {
      text(`${awayWin}  /  ${homeWin}`,M+12,680,half-24,9,1,true);
      const percent = Number(awayWin.match(/(\d+)%/)?.[1] || 50);
      pdf.setFillColor(225,96,103); pdf.roundedRect(M+12,690,half-24,12,4,4,"F");
      pdf.setFillColor(53,130,211); pdf.rect(M+12+(half-24)*percent/100,690,(half-24)*(100-percent)/100,12,"F");
      text(winRow.querySelector(".pwp-label")?.textContent || "Win probability",M+12,719,half-24,8,1);
    } else text(find("fva")?.text || "",M+12,689,half-24,10,3);
    const commentary=find("take");
    text(commentary?.text || "",M+half+24,629,half-24,10,3,true);
    const watch=sections.find(section => /Why watch/i.test(section.heading));
    text(watch?.text.split(/WHY WATCH\s*\|/i).pop()?.split(/\|?\s*WHY SKIP/i)[0] || find("readout")?.text || "",M+half+24,674,half-24,9,4);
    pdf.setTextColor(100,112,124); pdf.setFontSize(7);
    pdf.text(`fbwatch.elskatemm.com | ${new Date(date).toLocaleDateString("en-US", { timeZone: getTz() })} | Visual summary of available game data`,M,762);
    pdf.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}-${date.slice(0,10)}-game-report.pdf`);
  } finally { clone.remove(); }
}
