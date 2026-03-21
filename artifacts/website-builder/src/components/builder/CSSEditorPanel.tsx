import React, { useState } from "react";
import {
  X, Undo2, Redo2, Save, Paintbrush, Type, Square,
  ArrowUpDown, Maximize2, ChevronDown, ChevronRight, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { ElementInfo } from "@/hooks/useCSSEditor";

interface CSSEditorPanelProps {
  selectedElement: ElementInfo | null;
  onChangeProperty: (property: string, value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onClose: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  changeCount: number;
  generatedCSS: string;
  isSaving: boolean;
}

const FONT_WEIGHT_KEYS = [
  { value: "100", key: "css_weight_thin" },
  { value: "200", key: "css_weight_extra_light" },
  { value: "300", key: "css_weight_light" },
  { value: "400", key: "css_weight_normal" },
  { value: "500", key: "css_weight_medium" },
  { value: "600", key: "css_weight_semi_bold" },
  { value: "700", key: "css_weight_bold" },
  { value: "800", key: "css_weight_extra_bold" },
  { value: "900", key: "css_weight_black" },
];

const TEXT_ALIGN_KEYS: { value: string; key: string }[] = [
  { value: "left", key: "css_align_left" },
  { value: "center", key: "css_align_center" },
  { value: "right", key: "css_align_right" },
  { value: "justify", key: "css_align_justify" },
];

const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double", "groove", "ridge"];

function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const rgbToHex = (rgb: string): string => {
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return rgb.startsWith("#") ? rgb : "#000000";
    const r = parseInt(match[1]).toString(16).padStart(2, "0");
    const g = parseInt(match[2]).toString(16).padStart(2, "0");
    const b = parseInt(match[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-[#b0bac5] w-24 flex-shrink-0 truncate">{label}</span>
      <div className="flex items-center gap-1.5 flex-1">
        <input
          type="color"
          value={rgbToHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded border border-[#30363d] cursor-pointer bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#e1e4e8] font-mono focus:outline-none focus:border-[#58a6ff]"
        />
      </div>
    </div>
  );
}

function SliderInput({ value, onChange, label, min, max, step, unit }: {
  value: string; onChange: (v: string) => void; label: string;
  min: number; max: number; step?: number; unit?: string;
}) {
  const numericValue = parseFloat(value) || 0;
  const displayUnit = unit || (value.includes("px") ? "px" : value.includes("em") ? "em" : value.includes("rem") ? "rem" : value.includes("%") ? "%" : "px");

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-[#b0bac5] w-24 flex-shrink-0 truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={numericValue}
        onChange={(e) => onChange(`${e.target.value}${displayUnit}`)}
        className="flex-1 h-1 bg-[#30363d] rounded-full appearance-none cursor-pointer accent-[#58a6ff]"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-16 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-1 text-[11px] text-[#e1e4e8] font-mono text-center focus:outline-none focus:border-[#58a6ff]"
      />
    </div>
  );
}

function SelectInput({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void; label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-[#b0bac5] w-24 flex-shrink-0 truncate">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[11px] text-[#e1e4e8] focus:outline-none focus:border-[#58a6ff] cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function PropertySection({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[#1c2333]">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-[#b0bac5] uppercase tracking-wider hover:bg-[#1c2333]/50 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Icon className="w-3.5 h-3.5" />
        {title}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

export default function CSSEditorPanel({
  selectedElement,
  onChangeProperty,
  onUndo,
  onRedo,
  onSave,
  onClose,
  onClear,
  canUndo,
  canRedo,
  changeCount,
  generatedCSS,
  isSaving,
}: CSSEditorPanelProps) {
  const { t } = useI18n();
  const tRecord = t as unknown as Record<string, string>;
  const [showCSS, setShowCSS] = useState(false);
  const styles = selectedElement?.computedStyles || {};
  const fontWeights = FONT_WEIGHT_KEYS.map(fw => ({ value: fw.value, label: tRecord[fw.key] || fw.value }));
  const textAlignOptions = TEXT_ALIGN_KEYS.map(ta => ({ value: ta.value, label: tRecord[ta.key] || ta.value }));

  return (
    <div className="w-[280px] flex flex-col bg-[#0d1117] border-s border-[#1c2333] flex-shrink-0 h-full">
      <div className="h-9 flex items-center justify-between px-3 border-b border-[#1c2333] bg-[#161b22] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Paintbrush className="w-3.5 h-3.5 text-[#58a6ff]" />
          <span className="text-[11px] font-semibold text-[#e1e4e8]">{t.css_editor_title}</span>
          {changeCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1f6feb]/20 text-[#58a6ff] font-mono">
              {changeCount}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-[#b0bac5] hover:text-[#e1e4e8] hover:bg-[#1c2333] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1c2333] bg-[#161b22]">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={t.css_undo}
          className="p-1.5 rounded text-[#b0bac5] hover:text-[#e1e4e8] hover:bg-[#1c2333] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={t.css_redo}
          className="p-1.5 rounded text-[#b0bac5] hover:text-[#e1e4e8] hover:bg-[#1c2333] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
        {changeCount > 0 && (
          <>
            <button
              onClick={onClear}
              title={t.css_clear}
              className="p-1.5 rounded text-[#b0bac5] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#1f6feb] text-white text-[11px] font-medium rounded-md hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
            >
              <Save className="w-3 h-3" />
              {isSaving ? t.css_saving : t.css_save}
            </button>
          </>
        )}
      </div>

      {!selectedElement ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto bg-[#1c2333] rounded-full flex items-center justify-center mb-3">
              <Paintbrush className="w-6 h-6 opacity-40 text-[#58a6ff]" />
            </div>
            <p className="text-[13px] text-[#b0bac5]">{t.css_click_element}</p>
            <p className="text-[11px] text-[#484f58] mt-1">{t.css_click_hint}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 border-b border-[#1c2333] bg-[#161b22]/50">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono text-[#58a6ff]">&lt;{selectedElement.tagName.toLowerCase()}&gt;</span>
              {selectedElement.id && (
                <span className="text-[10px] font-mono text-emerald-400">#{selectedElement.id}</span>
              )}
            </div>
            {selectedElement.classList.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedElement.classList.map((c) => (
                  <span key={c} className="text-[10px] px-1 py-0.5 rounded bg-[#1c2333] text-[#b0bac5] font-mono">.{c}</span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[#484f58] font-mono mt-1 truncate" title={selectedElement.selector}>
              {selectedElement.selector}
            </p>
          </div>

          <PropertySection title={t.css_section_colors} icon={Paintbrush}>
            <ColorInput
              label={t.css_color}
              value={styles.color || ""}
              onChange={(v) => onChangeProperty("color", v)}
            />
            <ColorInput
              label={t.css_bg_color}
              value={styles.backgroundColor || ""}
              onChange={(v) => onChangeProperty("backgroundColor", v)}
            />
            <SliderInput
              label={t.css_opacity}
              value={styles.opacity || "1"}
              onChange={(v) => onChangeProperty("opacity", v)}
              min={0}
              max={1}
              step={0.05}
              unit=""
            />
          </PropertySection>

          <PropertySection title={t.css_section_typography} icon={Type}>
            <SliderInput
              label={t.css_font_size}
              value={styles.fontSize || "16px"}
              onChange={(v) => onChangeProperty("fontSize", v)}
              min={8}
              max={72}
            />
            <SelectInput
              label={t.css_font_weight}
              value={styles.fontWeight || "400"}
              onChange={(v) => onChangeProperty("fontWeight", v)}
              options={fontWeights}
            />
            <SliderInput
              label={t.css_line_height}
              value={styles.lineHeight || "1.5"}
              onChange={(v) => onChangeProperty("lineHeight", v)}
              min={0.5}
              max={4}
              step={0.1}
              unit=""
            />
            <SliderInput
              label={t.css_letter_spacing}
              value={styles.letterSpacing || "0px"}
              onChange={(v) => onChangeProperty("letterSpacing", v)}
              min={-5}
              max={20}
              step={0.5}
            />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#b0bac5] w-24 flex-shrink-0">{t.css_text_align}</span>
              <div className="flex gap-1">
                {textAlignOptions.map(({ value: align, label }) => (
                  <button
                    key={align}
                    onClick={() => onChangeProperty("textAlign", align)}
                    className={cn(
                      "px-2 py-1 text-[10px] rounded border transition-colors",
                      styles.textAlign === align
                        ? "bg-[#1f6feb]/20 border-[#1f6feb] text-[#58a6ff]"
                        : "border-[#30363d] text-[#b0bac5] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </PropertySection>

          <PropertySection title={t.css_section_spacing} icon={ArrowUpDown} defaultOpen={false}>
            <p className="text-[10px] text-[#484f58] font-semibold uppercase tracking-wider mb-1">{t.css_padding}</p>
            <SliderInput label={t.css_top} value={styles.paddingTop || "0px"} onChange={(v) => onChangeProperty("paddingTop", v)} min={0} max={100} />
            <SliderInput label={t.css_right} value={styles.paddingRight || "0px"} onChange={(v) => onChangeProperty("paddingRight", v)} min={0} max={100} />
            <SliderInput label={t.css_bottom} value={styles.paddingBottom || "0px"} onChange={(v) => onChangeProperty("paddingBottom", v)} min={0} max={100} />
            <SliderInput label={t.css_left} value={styles.paddingLeft || "0px"} onChange={(v) => onChangeProperty("paddingLeft", v)} min={0} max={100} />
            <p className="text-[10px] text-[#484f58] font-semibold uppercase tracking-wider mb-1 mt-2">{t.css_margin}</p>
            <SliderInput label={t.css_top} value={styles.marginTop || "0px"} onChange={(v) => onChangeProperty("marginTop", v)} min={-50} max={100} />
            <SliderInput label={t.css_right} value={styles.marginRight || "0px"} onChange={(v) => onChangeProperty("marginRight", v)} min={-50} max={100} />
            <SliderInput label={t.css_bottom} value={styles.marginBottom || "0px"} onChange={(v) => onChangeProperty("marginBottom", v)} min={-50} max={100} />
            <SliderInput label={t.css_left} value={styles.marginLeft || "0px"} onChange={(v) => onChangeProperty("marginLeft", v)} min={-50} max={100} />
          </PropertySection>

          <PropertySection title={t.css_section_border} icon={Square} defaultOpen={false}>
            <SliderInput
              label={t.css_border_width}
              value={styles.borderWidth || "0px"}
              onChange={(v) => onChangeProperty("borderWidth", v)}
              min={0}
              max={20}
            />
            <ColorInput
              label={t.css_border_color}
              value={styles.borderColor || ""}
              onChange={(v) => onChangeProperty("borderColor", v)}
            />
            <SelectInput
              label={t.css_border_style}
              value={styles.borderStyle || "none"}
              onChange={(v) => onChangeProperty("borderStyle", v)}
              options={BORDER_STYLES.map(s => ({ value: s, label: s }))}
            />
            <SliderInput
              label={t.css_border_radius}
              value={styles.borderRadius || "0px"}
              onChange={(v) => onChangeProperty("borderRadius", v)}
              min={0}
              max={100}
            />
          </PropertySection>

          <PropertySection title={t.css_section_size} icon={Maximize2} defaultOpen={false}>
            <SliderInput
              label={t.css_width}
              value={styles.width || "auto"}
              onChange={(v) => onChangeProperty("width", v)}
              min={0}
              max={1200}
            />
            <SliderInput
              label={t.css_height}
              value={styles.height || "auto"}
              onChange={(v) => onChangeProperty("height", v)}
              min={0}
              max={800}
            />
          </PropertySection>

          {changeCount > 0 && (
            <div className="border-t border-[#1c2333]">
              <button
                onClick={() => setShowCSS(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-[#b0bac5] uppercase tracking-wider hover:bg-[#1c2333]/50 transition-colors"
              >
                {showCSS ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {t.css_generated_code}
              </button>
              {showCSS && (
                <div className="px-3 pb-3">
                  <pre className="bg-[#0d1117] border border-[#30363d] rounded-md p-2 text-[11px] font-mono text-[#c9d1d9] overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                    {generatedCSS}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
