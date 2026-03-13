import { db } from "@workspace/db";
import {
  qaReportsTable,
  projectFilesTable,
  executionLogsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { JSDOM, VirtualConsole } from "jsdom";
import { FixerAgent } from "./fixer-agent";
import { FileManagerAgent } from "./filemanager-agent";
import { getConstitution } from "./constitution";
import type { GeneratedFile, CodeIssue, BuildContext } from "./types";

export interface QaCheckResult {
  status: "passed" | "failed" | "warning";
  score: number;
  details: {
    checks: QaCheckItem[];
    summary: string;
    summaryAr: string;
  };
}

export interface QaCheckItem {
  name: string;
  nameAr: string;
  passed: boolean;
  severity: "error" | "warning" | "info";
  message: string;
  messageAr: string;
  file?: string;
  line?: number;
}

export interface QaReport {
  id: string;
  buildId: string;
  projectId: string;
  status: string;
  overallScore: number | null;
  lint: QaCheckResult | null;
  runtime: QaCheckResult | null;
  functional: QaCheckResult | null;
  retryCount: number;
  fixAttempts: FixAttemptRecord[];
  totalDurationMs: number | null;
  totalCostUsd: string;
  createdAt: string;
  completedAt: string | null;
}

interface FixAttemptRecord {
  attempt: number;
  phase: string;
  issues: string[];
  fixed: boolean;
  timestamp: string;
}

const MAX_RETRIES = 3;

function lintCheck(files: { filePath: string; content: string }[]): QaCheckResult {
  const checks: QaCheckItem[] = [];
  let totalScore = 100;

  const htmlFiles = files.filter((f) => f.filePath.endsWith(".html"));
  const cssFiles = files.filter((f) => f.filePath.endsWith(".css"));
  const jsFiles = files.filter((f) => f.filePath.endsWith(".js"));

  if (htmlFiles.length === 0) {
    checks.push({
      name: "HTML file exists",
      nameAr: "ملف HTML موجود",
      passed: false,
      severity: "error",
      message: "No HTML files found in project",
      messageAr: "لا توجد ملفات HTML في المشروع",
    });
    totalScore -= 30;
  }

  for (const file of htmlFiles) {
    const c = file.content;

    if (!c.includes("<!DOCTYPE html>") && !c.includes("<!doctype html>")) {
      checks.push({
        name: "DOCTYPE declaration",
        nameAr: "إعلان DOCTYPE",
        passed: false,
        severity: "error",
        message: `Missing DOCTYPE declaration`,
        messageAr: `إعلان DOCTYPE مفقود`,
        file: file.filePath,
      });
      totalScore -= 10;
    } else {
      checks.push({
        name: "DOCTYPE declaration",
        nameAr: "إعلان DOCTYPE",
        passed: true,
        severity: "info",
        message: "DOCTYPE declaration present",
        messageAr: "إعلان DOCTYPE موجود",
        file: file.filePath,
      });
    }

    if (!/<html[^>]*lang=/.test(c)) {
      checks.push({
        name: "HTML lang attribute",
        nameAr: "سمة اللغة في HTML",
        passed: false,
        severity: "warning",
        message: "Missing lang attribute on <html> tag",
        messageAr: "سمة lang مفقودة في وسم <html>",
        file: file.filePath,
      });
      totalScore -= 5;
    } else {
      checks.push({
        name: "HTML lang attribute",
        nameAr: "سمة اللغة في HTML",
        passed: true,
        severity: "info",
        message: "lang attribute present",
        messageAr: "سمة اللغة موجودة",
        file: file.filePath,
      });
    }

    if (!c.includes("<meta charset") && !c.includes('<meta charset')) {
      checks.push({
        name: "Meta charset",
        nameAr: "ترميز الأحرف",
        passed: false,
        severity: "warning",
        message: "Missing charset meta tag",
        messageAr: "وسم ترميز الأحرف مفقود",
        file: file.filePath,
      });
      totalScore -= 5;
    } else {
      checks.push({
        name: "Meta charset",
        nameAr: "ترميز الأحرف",
        passed: true,
        severity: "info",
        message: "Charset meta tag present",
        messageAr: "وسم ترميز الأحرف موجود",
        file: file.filePath,
      });
    }

    if (!c.includes("viewport")) {
      checks.push({
        name: "Viewport meta",
        nameAr: "وسم viewport",
        passed: false,
        severity: "warning",
        message: "Missing viewport meta tag (responsive design)",
        messageAr: "وسم viewport مفقود (تصميم متجاوب)",
        file: file.filePath,
      });
      totalScore -= 5;
    } else {
      checks.push({
        name: "Viewport meta",
        nameAr: "وسم viewport",
        passed: true,
        severity: "info",
        message: "Viewport meta tag present",
        messageAr: "وسم viewport موجود",
        file: file.filePath,
      });
    }

    if (!c.includes("<title>") && !c.includes("<title ")) {
      checks.push({
        name: "Title tag",
        nameAr: "وسم العنوان",
        passed: false,
        severity: "warning",
        message: "Missing <title> tag",
        messageAr: "وسم <title> مفقود",
        file: file.filePath,
      });
      totalScore -= 5;
    } else {
      checks.push({
        name: "Title tag",
        nameAr: "وسم العنوان",
        passed: true,
        severity: "info",
        message: "Title tag present",
        messageAr: "وسم العنوان موجود",
        file: file.filePath,
      });
    }

    if (/on\w+\s*=\s*["']/.test(c)) {
      checks.push({
        name: "Inline event handlers",
        nameAr: "معالجات الأحداث المضمنة",
        passed: false,
        severity: "warning",
        message: "Inline event handlers found (potential XSS risk)",
        messageAr: "وُجدت معالجات أحداث مضمنة (خطر XSS محتمل)",
        file: file.filePath,
      });
      totalScore -= 5;
    }

    const imgTags = c.match(/<img[^>]*>/gi) || [];
    const imgsWithoutAlt = imgTags.filter((t) => !/alt\s*=/.test(t));
    if (imgsWithoutAlt.length > 0) {
      checks.push({
        name: "Image alt attributes",
        nameAr: "سمات alt للصور",
        passed: false,
        severity: "warning",
        message: `${imgsWithoutAlt.length} image(s) missing alt attribute`,
        messageAr: `${imgsWithoutAlt.length} صورة بدون سمة alt`,
        file: file.filePath,
      });
      totalScore -= 3;
    } else if (imgTags.length > 0) {
      checks.push({
        name: "Image alt attributes",
        nameAr: "سمات alt للصور",
        passed: true,
        severity: "info",
        message: "All images have alt attributes",
        messageAr: "جميع الصور تحتوي على سمة alt",
        file: file.filePath,
      });
    }
  }

  for (const file of jsFiles) {
    if (file.content.includes("eval(")) {
      checks.push({
        name: "No eval() usage",
        nameAr: "عدم استخدام eval()",
        passed: false,
        severity: "error",
        message: "eval() usage detected (security risk)",
        messageAr: "تم اكتشاف استخدام eval() (خطر أمني)",
        file: file.filePath,
      });
      totalScore -= 15;
    }

    if (file.content.includes("document.write(")) {
      checks.push({
        name: "No document.write()",
        nameAr: "عدم استخدام document.write()",
        passed: false,
        severity: "warning",
        message: "document.write() usage detected",
        messageAr: "تم اكتشاف استخدام document.write()",
        file: file.filePath,
      });
      totalScore -= 5;
    }
  }

  for (const file of cssFiles) {
    if (file.content.includes("@media")) {
      checks.push({
        name: "Responsive CSS",
        nameAr: "CSS متجاوب",
        passed: true,
        severity: "info",
        message: "Media queries found (responsive design)",
        messageAr: "استعلامات الوسائط موجودة (تصميم متجاوب)",
        file: file.filePath,
      });
    }
  }

  if (checks.length === 0) {
    checks.push({
      name: "Basic structure",
      nameAr: "البنية الأساسية",
      passed: true,
      severity: "info",
      message: "No issues found",
      messageAr: "لم يتم العثور على مشاكل",
    });
  }

  const score = Math.max(0, Math.min(100, totalScore));
  const failed = checks.filter((c) => !c.passed && c.severity === "error");
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning");

  return {
    status: failed.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
    score,
    details: {
      checks,
      summary: `${checks.filter((c) => c.passed).length}/${checks.length} checks passed. ${failed.length} errors, ${warnings.length} warnings.`,
      summaryAr: `${checks.filter((c) => c.passed).length}/${checks.length} فحص ناجح. ${failed.length} أخطاء، ${warnings.length} تحذيرات.`,
    },
  };
}

function runtimeCheck(files: { filePath: string; content: string }[]): QaCheckResult {
  const checks: QaCheckItem[] = [];
  let totalScore = 100;

  const htmlFiles = files.filter((f) => f.filePath.endsWith(".html"));
  const cssFiles = files.filter((f) => f.filePath.endsWith(".css"));
  const jsFiles = files.filter((f) => f.filePath.endsWith(".js"));

  const indexHtml = htmlFiles.find(
    (f) => f.filePath === "index.html" || f.filePath.endsWith("/index.html")
  );

  if (!indexHtml) {
    checks.push({
      name: "Entry point exists",
      nameAr: "نقطة الدخول موجودة",
      passed: false,
      severity: "error",
      message: "No index.html entry point found",
      messageAr: "لم يتم العثور على ملف index.html",
    });
    totalScore -= 30;
  } else {
    checks.push({
      name: "Entry point exists",
      nameAr: "نقطة الدخول موجودة",
      passed: true,
      severity: "info",
      message: "index.html entry point found",
      messageAr: "ملف index.html موجود",
    });

    let fullHtml = indexHtml.content;
    for (const css of cssFiles) {
      const fileName = css.filePath.split("/").pop()!;
      if (fullHtml.includes(fileName)) {
        fullHtml = fullHtml.replace(
          new RegExp(`<link[^>]*href=["']([^"']*${fileName.replace(/\./g, "\\.")})[^"']*["'][^>]*>`, "gi"),
          `<style>${css.content}</style>`
        );
      }
    }

    for (const js of jsFiles) {
      const fileName = js.filePath.split("/").pop()!;
      if (fullHtml.includes(fileName)) {
        fullHtml = fullHtml.replace(
          new RegExp(`<script[^>]*src=["']([^"']*${fileName.replace(/\./g, "\\.")})[^"']*["'][^>]*>\\s*</script>`, "gi"),
          `<script>${js.content}</script>`
        );
      }
    }

    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];

    const virtualConsole = new VirtualConsole();
    virtualConsole.on("error", (msg: string) => consoleErrors.push(String(msg)));
    virtualConsole.on("warn", (msg: string) => consoleWarnings.push(String(msg)));
    virtualConsole.on("jsdomError", (err: Error) => consoleErrors.push(err.message));

    let dom: JSDOM | null = null;
    let domParsed = false;

    try {
      dom = new JSDOM(fullHtml, {
        runScripts: "dangerously",
        virtualConsole,
        pretendToBeVisual: true,
        url: "http://localhost/",
      });
      domParsed = true;
    } catch (parseError) {
      checks.push({
        name: "HTML parse & execute",
        nameAr: "تحليل وتنفيذ HTML",
        passed: false,
        severity: "error",
        message: `Failed to parse/execute HTML: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        messageAr: `فشل في تحليل/تنفيذ HTML: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      });
      totalScore -= 30;
    }

    if (domParsed && dom) {
      checks.push({
        name: "HTML parse & execute",
        nameAr: "تحليل وتنفيذ HTML",
        passed: true,
        severity: "info",
        message: "HTML parsed and scripts executed successfully",
        messageAr: "تم تحليل HTML وتنفيذ البرامج النصية بنجاح",
      });

      const doc = dom.window.document;

      const bodyContent = doc.body?.innerHTML?.trim() || "";
      if (bodyContent.length > 0) {
        checks.push({
          name: "Body renders content",
          nameAr: "محتوى الصفحة يُعرض",
          passed: true,
          severity: "info",
          message: `Body rendered with ${bodyContent.length} chars of content`,
          messageAr: `تم عرض محتوى الصفحة بـ ${bodyContent.length} حرف`,
        });
      } else {
        checks.push({
          name: "Body renders content",
          nameAr: "محتوى الصفحة يُعرض",
          passed: false,
          severity: "error",
          message: "Body is empty after rendering — page shows nothing",
          messageAr: "محتوى الصفحة فارغ بعد العرض — الصفحة لا تظهر شيئاً",
        });
        totalScore -= 25;
      }

      const visibleElements = doc.querySelectorAll("h1, h2, h3, p, div, span, button, a, img, form, input, nav, header, footer, section, main");
      if (visibleElements.length > 0) {
        checks.push({
          name: "Visible DOM elements",
          nameAr: "عناصر DOM مرئية",
          passed: true,
          severity: "info",
          message: `${visibleElements.length} visible DOM elements found after execution`,
          messageAr: `${visibleElements.length} عنصر DOM مرئي بعد التنفيذ`,
        });
      } else {
        checks.push({
          name: "Visible DOM elements",
          nameAr: "عناصر DOM مرئية",
          passed: false,
          severity: "error",
          message: "No visible DOM elements found after execution",
          messageAr: "لم يتم العثور على عناصر DOM مرئية بعد التنفيذ",
        });
        totalScore -= 20;
      }

      if (consoleErrors.length > 0) {
        const uniqueErrors = [...new Set(consoleErrors)].slice(0, 5);
        checks.push({
          name: "No runtime errors",
          nameAr: "عدم وجود أخطاء تشغيل",
          passed: false,
          severity: "error",
          message: `${consoleErrors.length} runtime error(s): ${uniqueErrors.join("; ")}`,
          messageAr: `${consoleErrors.length} خطأ أثناء التشغيل: ${uniqueErrors.join("; ")}`,
        });
        totalScore -= Math.min(30, consoleErrors.length * 10);
      } else {
        checks.push({
          name: "No runtime errors",
          nameAr: "عدم وجود أخطاء تشغيل",
          passed: true,
          severity: "info",
          message: "No JavaScript runtime errors detected",
          messageAr: "لم يتم اكتشاف أخطاء JavaScript أثناء التشغيل",
        });
      }

      if (consoleWarnings.length > 0) {
        checks.push({
          name: "Console warnings",
          nameAr: "تحذيرات وحدة التحكم",
          passed: false,
          severity: "warning",
          message: `${consoleWarnings.length} console warning(s)`,
          messageAr: `${consoleWarnings.length} تحذير في وحدة التحكم`,
        });
        totalScore -= Math.min(10, consoleWarnings.length * 3);
      }

      dom.window.close();
    }
  }

  for (const css of cssFiles) {
    const unclosedBraces = (css.content.match(/{/g) || []).length - (css.content.match(/}/g) || []).length;
    if (unclosedBraces !== 0) {
      checks.push({
        name: "CSS syntax",
        nameAr: "بنية CSS",
        passed: false,
        severity: "error",
        message: `Unbalanced braces in ${css.filePath} (${unclosedBraces > 0 ? "unclosed" : "extra closing"})`,
        messageAr: `أقواس غير متوازنة في ${css.filePath}`,
        file: css.filePath,
      });
      totalScore -= 15;
    }
  }

  const score = Math.max(0, Math.min(100, totalScore));
  const failed = checks.filter((c) => !c.passed && c.severity === "error");
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning");

  return {
    status: failed.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
    score,
    details: {
      checks,
      summary: `Runtime validation: ${checks.filter((c) => c.passed).length}/${checks.length} passed. ${failed.length} errors.`,
      summaryAr: `التحقق من التشغيل: ${checks.filter((c) => c.passed).length}/${checks.length} ناجح. ${failed.length} أخطاء.`,
    },
  };
}

function functionalCheck(files: { filePath: string; content: string }[]): QaCheckResult {
  const checks: QaCheckItem[] = [];
  let totalScore = 100;

  const htmlFiles = files.filter((f) => f.filePath.endsWith(".html"));
  const cssFiles = files.filter((f) => f.filePath.endsWith(".css"));
  const jsFiles = files.filter((f) => f.filePath.endsWith(".js"));

  const indexHtml = htmlFiles.find(
    (f) => f.filePath === "index.html" || f.filePath.endsWith("/index.html")
  );

  if (!indexHtml) {
    checks.push({
      name: "Entry page available",
      nameAr: "الصفحة الرئيسية متاحة",
      passed: false,
      severity: "error",
      message: "No index.html — site cannot load",
      messageAr: "لا يوجد index.html — لا يمكن تحميل الموقع",
    });
    totalScore -= 30;

    const score = Math.max(0, totalScore);
    return {
      status: "failed",
      score,
      details: {
        checks,
        summary: `Functional check: 0/1 passed. 1 error.`,
        summaryAr: `الفحص الوظيفي: 0/1 ناجح. 1 خطأ.`,
      },
    };
  }

  let fullHtml = indexHtml.content;
  for (const css of cssFiles) {
    const fileName = css.filePath.split("/").pop()!;
    if (fullHtml.includes(fileName)) {
      fullHtml = fullHtml.replace(
        new RegExp(`<link[^>]*href=["']([^"']*${fileName.replace(/\./g, "\\.")})[^"']*["'][^>]*>`, "gi"),
        `<style>${css.content}</style>`
      );
    }
  }
  for (const js of jsFiles) {
    const fileName = js.filePath.split("/").pop()!;
    if (fullHtml.includes(fileName)) {
      fullHtml = fullHtml.replace(
        new RegExp(`<script[^>]*src=["']([^"']*${fileName.replace(/\./g, "\\.")})[^"']*["'][^>]*>\\s*</script>`, "gi"),
        `<script>${js.content}</script>`
      );
    }
  }

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  virtualConsole.on("error", () => {});

  let dom: JSDOM;
  try {
    dom = new JSDOM(fullHtml, {
      runScripts: "dangerously",
      virtualConsole,
      pretendToBeVisual: true,
      url: "http://localhost/",
    });
  } catch {
    checks.push({
      name: "Page loads",
      nameAr: "تحميل الصفحة",
      passed: false,
      severity: "error",
      message: "Site fails to load and execute",
      messageAr: "فشل الموقع في التحميل والتنفيذ",
    });
    totalScore -= 30;

    const score = Math.max(0, totalScore);
    return {
      status: "failed",
      score,
      details: {
        checks,
        summary: `Functional check: 0/1 passed. 1 error.`,
        summaryAr: `الفحص الوظيفي: 0/1 ناجح. 1 خطأ.`,
      },
    };
  }

  const doc = dom.window.document;

  const navEl = doc.querySelector("nav, header, [role='navigation']");
  checks.push({
    name: "Navigation present",
    nameAr: "التنقل موجود",
    passed: !!navEl,
    severity: navEl ? "info" : "warning",
    message: navEl ? "Navigation element rendered in DOM" : "No navigation element rendered",
    messageAr: navEl ? "عنصر التنقل موجود في DOM" : "عنصر التنقل غير موجود في DOM",
  });
  if (!navEl) totalScore -= 5;

  const links = doc.querySelectorAll("a[href]");
  checks.push({
    name: "Interactive links",
    nameAr: "روابط تفاعلية",
    passed: links.length > 0,
    severity: links.length > 0 ? "info" : "warning",
    message: links.length > 0 ? `${links.length} interactive link(s) rendered` : "No interactive links rendered",
    messageAr: links.length > 0 ? `${links.length} رابط تفاعلي` : "لا توجد روابط تفاعلية",
  });
  if (links.length === 0) totalScore -= 3;

  const semanticTags = doc.querySelectorAll("main, section, article, aside, footer");
  checks.push({
    name: "Semantic HTML",
    nameAr: "HTML دلالي",
    passed: semanticTags.length > 0,
    severity: semanticTags.length > 0 ? "info" : "warning",
    message: semanticTags.length > 0 ? `${semanticTags.length} semantic element(s) rendered` : "No semantic HTML elements in rendered DOM",
    messageAr: semanticTags.length > 0 ? `${semanticTags.length} عنصر دلالي` : "لا توجد عناصر HTML دلالية في DOM",
  });
  if (semanticTags.length === 0) totalScore -= 5;

  const htmlEl = doc.documentElement;
  const hasRtl = htmlEl?.getAttribute("dir") === "rtl" ||
    doc.querySelector("[dir='rtl']") !== null ||
    fullHtml.includes("direction: rtl") || fullHtml.includes("direction:rtl");
  checks.push({
    name: "RTL support",
    nameAr: "دعم RTL",
    passed: hasRtl,
    severity: hasRtl ? "info" : "warning",
    message: hasRtl ? "RTL direction support found" : "No RTL support detected",
    messageAr: hasRtl ? "دعم اتجاه RTL موجود" : "لم يتم اكتشاف دعم RTL",
  });
  if (!hasRtl) totalScore -= 3;

  const visibleEls = doc.querySelectorAll("h1, h2, h3, h4, h5, h6, p, button, input, form, img");
  checks.push({
    name: "Visible content rendered",
    nameAr: "محتوى مرئي معروض",
    passed: visibleEls.length > 0,
    severity: visibleEls.length > 0 ? "info" : "error",
    message: visibleEls.length > 0 ? `${visibleEls.length} visible content element(s) rendered` : "No visible content elements rendered in DOM",
    messageAr: visibleEls.length > 0 ? `${visibleEls.length} عنصر محتوى مرئي` : "لا توجد عناصر محتوى مرئية في DOM",
  });
  if (visibleEls.length === 0) totalScore -= 20;

  const forms = doc.querySelectorAll("form");
  const buttons = doc.querySelectorAll("button, input[type='submit'], input[type='button']");
  if (forms.length > 0 || buttons.length > 0) {
    checks.push({
      name: "Interactive elements",
      nameAr: "عناصر تفاعلية",
      passed: true,
      severity: "info",
      message: `${forms.length} form(s) and ${buttons.length} button(s) rendered`,
      messageAr: `${forms.length} نموذج و${buttons.length} زر`,
    });
  }

  const textContent = doc.body?.textContent?.trim() || "";
  if (textContent.length < 10) {
    checks.push({
      name: "Meaningful text content",
      nameAr: "محتوى نصي ذو معنى",
      passed: false,
      severity: "warning",
      message: "Very little text content rendered on page",
      messageAr: "محتوى نصي قليل جداً في الصفحة",
    });
    totalScore -= 5;
  } else {
    checks.push({
      name: "Meaningful text content",
      nameAr: "محتوى نصي ذو معنى",
      passed: true,
      severity: "info",
      message: `${textContent.length} characters of text content rendered`,
      messageAr: `${textContent.length} حرف من المحتوى النصي`,
    });
  }

  dom.window.close();

  const score = Math.max(0, Math.min(100, totalScore));
  const failed = checks.filter((c) => !c.passed && c.severity === "error");
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning");

  return {
    status: failed.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
    score,
    details: {
      checks,
      summary: `Functional check: ${checks.filter((c) => c.passed).length}/${checks.length} passed. ${failed.length} errors, ${warnings.length} warnings.`,
      summaryAr: `الفحص الوظيفي: ${checks.filter((c) => c.passed).length}/${checks.length} ناجح. ${failed.length} أخطاء، ${warnings.length} تحذيرات.`,
    },
  };
}

export function collectQaIssues(
  lint: QaCheckResult,
  runtime: QaCheckResult,
  functional: QaCheckResult
): CodeIssue[] {
  const issues: CodeIssue[] = [];

  const allChecks = [
    ...lint.details.checks,
    ...runtime.details.checks,
    ...functional.details.checks,
  ];

  for (const check of allChecks) {
    if (!check.passed && (check.severity === "error" || check.severity === "warning")) {
      issues.push({
        file: check.file || "unknown",
        line: check.line,
        severity: check.severity,
        message: check.message,
      });
    }
  }

  return issues;
}

export async function runQaPipeline(
  buildId: string,
  projectId: string
): Promise<string> {
  const startTime = Date.now();

  const [report] = await db
    .insert(qaReportsTable)
    .values({
      buildId,
      projectId,
      status: "in_progress",
    })
    .returning();

  const reportId = report.id;

  try {
    const files = await db
      .select({ filePath: projectFilesTable.filePath, content: projectFilesTable.content })
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));

    if (files.length === 0) {
      await db
        .update(qaReportsTable)
        .set({
          status: "failed",
          overallScore: 0,
          lintStatus: "failed",
          lintScore: 0,
          lintDetails: { checks: [], summary: "No files to check", summaryAr: "لا توجد ملفات للفحص" },
          runtimeStatus: "failed",
          runtimeScore: 0,
          runtimeDetails: { checks: [], summary: "No files to run", summaryAr: "لا توجد ملفات للتشغيل" },
          functionalStatus: "failed",
          functionalScore: 0,
          functionalDetails: { checks: [], summary: "No files to test", summaryAr: "لا توجد ملفات للاختبار" },
          totalDurationMs: Date.now() - startTime,
          completedAt: new Date(),
        })
        .where(eq(qaReportsTable.id, reportId));
      return reportId;
    }

    const result = await runQaValidation(files);

    await db
      .update(qaReportsTable)
      .set({
        status: result.status,
        overallScore: result.overallScore,
        lintStatus: result.lint.status,
        lintScore: result.lint.score,
        lintDetails: result.lint.details,
        runtimeStatus: result.runtime.status,
        runtimeScore: result.runtime.score,
        runtimeDetails: result.runtime.details,
        functionalStatus: result.functional.status,
        functionalScore: result.functional.score,
        functionalDetails: result.functional.details,
        totalDurationMs: Date.now() - startTime,
        completedAt: new Date(),
      })
      .where(eq(qaReportsTable.id, reportId));

    return reportId;
  } catch (error) {
    await db
      .update(qaReportsTable)
      .set({
        status: "error",
        totalDurationMs: Date.now() - startTime,
        completedAt: new Date(),
      })
      .where(eq(qaReportsTable.id, reportId));
    throw error;
  }
}

async function runQaValidation(
  files: { filePath: string; content: string }[]
): Promise<{ lint: QaCheckResult; runtime: QaCheckResult; functional: QaCheckResult; overallScore: number; status: string }> {
  const lint = lintCheck(files);
  const runtime = runtimeCheck(files);
  const functional = functionalCheck(files);

  const overallScore = Math.round(
    (lint.score * 0.35) + (runtime.score * 0.35) + (functional.score * 0.30)
  );

  const hasErrors = lint.status === "failed" || runtime.status === "failed" || functional.status === "failed";
  const hasWarnings = lint.status === "warning" || runtime.status === "warning" || functional.status === "warning";
  const status = overallScore >= 70 ? (hasWarnings ? "warning" : "passed") : (hasErrors ? "failed" : hasWarnings ? "warning" : "passed");

  return { lint, runtime, functional, overallScore, status };
}

function collectFailedIssues(
  lint: QaCheckResult,
  runtime: QaCheckResult,
  functional: QaCheckResult
): CodeIssue[] {
  const issues: CodeIssue[] = [];

  for (const check of [...lint.details.checks, ...runtime.details.checks, ...functional.details.checks]) {
    if (!check.passed && check.severity === "error") {
      issues.push({
        file: check.file || "unknown",
        line: check.line,
        severity: check.severity,
        message: check.message,
      });
    }
  }

  return issues;
}

export async function runQaWithRetry(
  buildId: string,
  projectId: string,
  userId: string
): Promise<string> {
  const startTime = Date.now();
  const constitution = getConstitution();
  const fixerAgent = new FixerAgent(constitution);
  const fileManager = new FileManagerAgent(constitution);
  const fixAttemptsLog: FixAttemptRecord[] = [];

  const [report] = await db
    .insert(qaReportsTable)
    .values({
      buildId,
      projectId,
      status: "in_progress",
    })
    .returning();

  const reportId = report.id;

  try {
    let files = await db
      .select({ filePath: projectFilesTable.filePath, content: projectFilesTable.content })
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));

    if (files.length === 0) {
      await db
        .update(qaReportsTable)
        .set({
          status: "failed",
          overallScore: 0,
          lintStatus: "failed",
          lintScore: 0,
          lintDetails: { checks: [], summary: "No files to check", summaryAr: "لا توجد ملفات للفحص" },
          runtimeStatus: "failed",
          runtimeScore: 0,
          runtimeDetails: { checks: [], summary: "No files to run", summaryAr: "لا توجد ملفات للتشغيل" },
          functionalStatus: "failed",
          functionalScore: 0,
          functionalDetails: { checks: [], summary: "No files to test", summaryAr: "لا توجد ملفات للاختبار" },
          totalDurationMs: Date.now() - startTime,
          completedAt: new Date(),
        })
        .where(eq(qaReportsTable.id, reportId));
      return reportId;
    }

    let result = await runQaValidation(files);
    let retryCount = 0;

    while (result.status === "failed" && retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`[QA] Build ${buildId}: QA failed (score: ${result.overallScore}), auto-fix attempt ${retryCount}/${MAX_RETRIES}`);

      const issues = collectFailedIssues(result.lint, result.runtime, result.functional);
      const failedPhase = result.lint.status === "failed" ? "lint" : result.runtime.status === "failed" ? "runtime" : "functional";

      let fixed = false;

      try {
        const buildContext: BuildContext = {
          buildId,
          projectId,
          userId,
          prompt: `Fix QA issues found during ${failedPhase} phase`,
          existingFiles: files.map((f) => ({
            filePath: f.filePath,
            content: f.content,
          })),
          tokensUsedSoFar: 0,
        };

        const fixResult = await fixerAgent.executeWithIssues(buildContext, issues);

        if (fixResult.success && fixResult.data?.files) {
          const fixedFiles = fixResult.data.files as GeneratedFile[];

          if (fixedFiles.length > 0) {
            await fileManager.saveFiles(projectId, fixedFiles);

            files = await db
              .select({ filePath: projectFilesTable.filePath, content: projectFilesTable.content })
              .from(projectFilesTable)
              .where(eq(projectFilesTable.projectId, projectId));

            const newResult = await runQaValidation(files);
            fixed = newResult.overallScore > result.overallScore;
            result = newResult;
          }
        }
      } catch (fixError) {
        console.error(`[QA] Build ${buildId}: Fix attempt ${retryCount} error:`, fixError);
      }

      fixAttemptsLog.push({
        attempt: retryCount,
        phase: failedPhase,
        issues: issues.slice(0, 10).map((i) => i.message),
        fixed,
        timestamp: new Date().toISOString(),
      });

      await db
        .update(qaReportsTable)
        .set({
          retryCount,
          fixAttempts: fixAttemptsLog,
        })
        .where(eq(qaReportsTable.id, reportId));
    }

    await db
      .update(qaReportsTable)
      .set({
        status: result.status,
        overallScore: result.overallScore,
        lintStatus: result.lint.status,
        lintScore: result.lint.score,
        lintDetails: result.lint.details,
        runtimeStatus: result.runtime.status,
        runtimeScore: result.runtime.score,
        runtimeDetails: result.runtime.details,
        functionalStatus: result.functional.status,
        functionalScore: result.functional.score,
        functionalDetails: result.functional.details,
        fixAttempts: fixAttemptsLog.length > 0 ? fixAttemptsLog : null,
        totalDurationMs: Date.now() - startTime,
        completedAt: new Date(),
      })
      .where(eq(qaReportsTable.id, reportId));

    await db.insert(executionLogsTable).values({
      buildId,
      projectId,
      taskId: null,
      agentType: "qa_pipeline",
      action: "qa_validation",
      status: result.status,
      details: {
        overallScore: result.overallScore,
        lintScore: result.lint.score,
        runtimeScore: result.runtime.score,
        functionalScore: result.functional.score,
        retryCount,
        fixAttempts: fixAttemptsLog.length,
      },
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
    });

    return reportId;
  } catch (error) {
    await db
      .update(qaReportsTable)
      .set({
        status: "error",
        totalDurationMs: Date.now() - startTime,
        completedAt: new Date(),
      })
      .where(eq(qaReportsTable.id, reportId));
    throw error;
  }
}
