import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env.local") });

import { organizePageWithDeepSeek } from "./src/lib/deepseek_organizer.ts";

async function run20PagesExtraction() {
  const filePath = path.join(__dirname, "uploads", "file_1785482750508_gq4x7_1-since.pdf");
  const data = new Uint8Array(fs.readFileSync(filePath));

  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    disableWorker: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  console.log("=== EXECUTING 20-PAGE TEST PIPELINE FOR SCIENCE BOOK ===");

  let successCount = 0;
  let fullMarkdown = "# منهج العلوم - الصف الأول الإعدادي\n\n";

  for (let p = 1; p <= 20; p++) {
    console.log(`\n--- PROCESSING PAGE ${p}/20 ---`);
    try {
      const page = await pdfDoc.getPage(p);

      // 1. Text check
      const textContent = await page.getTextContent();
      const textItems = textContent.items.map((item) => item.str || "");
      const pdfText = textItems.join(" ").trim();

      let imageBuffer = null;

      // 2. Extract XObject Image
      const opList = await page.getOperatorList();
      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];

        if (
          fn === pdfjsLib.OPS.paintImageXObject ||
          fn === pdfjsLib.OPS.paintInlineImageXObject ||
          fn === pdfjsLib.OPS.paintJpegXObject
        ) {
          const imgName = args[0];
          const imgObj = await new Promise((resolve) => {
            page.objs.get(imgName, (obj) => resolve(obj));
          });

          if (imgObj && imgObj.width && imgObj.height && imgObj.data) {
            const canvas = createCanvas(imgObj.width, imgObj.height);
            const ctx = canvas.getContext("2d");
            const imgData = ctx.createImageData(imgObj.width, imgObj.height);

            const srcData = imgObj.data;
            const destData = imgData.data;

            if (srcData.length === imgObj.width * imgObj.height * 4) {
              destData.set(srcData);
            } else if (srcData.length === imgObj.width * imgObj.height * 3) {
              let j = 0;
              for (let k = 0; k < srcData.length; k += 3) {
                destData[j] = srcData[k];
                destData[j + 1] = srcData[k + 1];
                destData[j + 2] = srcData[k + 2];
                destData[j + 3] = 255;
                j += 4;
              }
            } else if (srcData.length === imgObj.width * imgObj.height) {
              let j = 0;
              for (let k = 0; k < srcData.length; k++) {
                const val = srcData[k];
                destData[j] = val;
                destData[j + 1] = val;
                destData[j + 2] = val;
                destData[j + 3] = 255;
                j += 4;
              }
            }

            ctx.putImageData(imgData, 0, 0);
            imageBuffer = canvas.toBuffer("image/jpeg");
            console.log(`Page ${p}: Extracted image buffer ${imageBuffer.length} bytes (${imgObj.width}x${imgObj.height})`);
            break;
          }
        }
      }

      // 3. Unified DeepSeek 4.1 Multimodal Processing (Image + Text)
      const markdown = await organizePageWithDeepSeek(imageBuffer, pdfText, {
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        subjectName: "العلوم",
        gradeLevel: "1_middle",
        pageNumber: p,
        maxRetries: 3,
      });

      console.log(`Page ${p}: DeepSeek 4.1 Multimodal Markdown generated (${markdown.length} chars)`);
      if (markdown.trim().length > 0) {
        console.log(`--- PAGE ${p} OUTPUT SAMPLE ---`);
        console.log(markdown.substring(0, 200) + "...\n");
        fullMarkdown += `\n\n<!-- بداية الصفحة ${p} -->\n` + markdown;
      }

      successCount++;
    } catch (err) {
      console.error(`Page ${p} failed:`, err.message);
    }
  }

  console.log(`\n=================== SUCCESS: ${successCount}/20 PAGES PROCESSED ===================`);
  const outputPath = path.join(__dirname, "output", "1_middle", "العلوم_الدرس_الأول_20صفحة.md");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, fullMarkdown, "utf-8");
  console.log("Output saved to:", outputPath);
}

run20PagesExtraction().catch(console.error);
