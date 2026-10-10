import katex from 'katex';
import 'katex/contrib/mhchem';

const MACROS: Record<string, string> = {
  '\\RR': '\\mathbb{R}',
  '\\NN': '\\mathbb{N}',
  '\\ZZ': '\\mathbb{Z}',
  '\\QQ': '\\mathbb{Q}',
  '\\CC': '\\mathbb{C}',
  '\\degree': '^\\circ',
  '\\textdegree': '^\\circ',
  '\\degreeC': '^\\circ\\text{C}',
  '\\celsius': '^\\circ\\text{C}',
  '\\textcelsius': '^\\circ\\text{C}',
  '\\ohm': '\\Omega',
  '\\Ohm': '\\Omega',
  '\\micro': '\\mu',
  '\\upmu': '\\mu',
  '\\SI': '#1\\,\\mathrm{#2}',
  '\\qty': '#1\\,\\mathrm{#2}',
  '\\si': '\\mathrm{#1}',
  '\\unit': '\\mathrm{#1}',
  '\\num': '#1',
  '\\ang': '#1^\\circ',
  '\\per': '/',
  '\\vv': '\\overrightarrow{#1}',
  '\\overarc': '\\overgroup{#1}',
  '\\arc': '\\overgroup{#1}',
  '\\tg': '\\tan',
  '\\ctg': '\\cot',
  '\\O': '\\varnothing',
  '\\ga': '\\text{جا}',
  '\\gta': '\\text{جتا}',
  '\\za': '\\text{ظا}',
  '\\zota': '\\text{ظتا}',
  '\\qaf': '\\text{ق}',
  '\\lam': '\\text{ل}',
  '\\naha': '\\text{نها}',
  '\\logar': '\\text{لو}',
  '\\defe': '\\text{د}',
  '\\had': '\\text{ح}',
};

const TEXT_MODE_CMD = /^\\(?:text(?:bf|it|rm|sf|tt|normal|up|md|sc)|emph|aa|AA|ae|AE|oe|OE|ss|i|j|l|L|o)$/;

// Math commands written inside \text{...} (e.g. \text{kg\cdot m/s}) render as red source in KaTeX, so they are lifted
// back into math mode: \text{kg}\cdot\text{m/s}.
export const liftMathFromText = (f: string): string =>
  f.replace(/\\(text|mbox|textrm|textnormal)\{([^{}]*)\}/g, (m, cmd: string, body: string) => {
    if (!/\\[a-zA-Z]/.test(body)) return m;
    let out = '';
    let buf = '';
    const flush = () => {
      if (buf.trim()) out += `\\${cmd}{${buf.trim()}}`;
      buf = '';
    };
    for (const part of body.split(/(\\[a-zA-Z]+)/)) {
      if (!/^\\[a-zA-Z]+$/.test(part) || TEXT_MODE_CMD.test(part)) buf += part;
      else {
        flush();
        out += `${part} `;
      }
    }
    flush();
    return out.trim();
  });

const ERROR_COLOR = /(<span class="mord[^"]*") style="color:#cc0000;"/g;
const UNKNOWN_NAME = /(<span class="mord[^"]*">)\\([a-zA-Z]+)<\/span>/g;

// Returns '' when the formula cannot be parsed; unknown commands are shown as their plain name instead of red source.
export const renderLatex = (formula: string, block: boolean): string => {
  const html = katex.renderToString(formula, {
    displayMode: block,
    throwOnError: false,
    strict: false,
    trust: false,
    macros: { ...MACROS },
  });
  if (html.includes('class="katex-error"')) return '';
  if (!html.includes('color:#cc0000')) return html;
  return html.replace(ERROR_COLOR, '$1').replace(UNKNOWN_NAME, '$1$2</span>').replace(/ mathcolor="#cc0000"/g, '');
};
