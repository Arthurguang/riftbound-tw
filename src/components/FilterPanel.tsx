'use client';

import { DOMAIN_LABELS, RARITY_LABELS, SET_LABELS, TYPE_LABELS } from '@/lib/labels';
import { DomainDot } from './CardBadges';
import { t, type TextLang } from '@/lib/i18n';
import { MARKS, type Filters } from '@/lib/search';
import type { Domain, Taxonomy } from '@/lib/types';

type ToggleGroupProps<T extends string | number> = {
  title: string;
  options: readonly { value: T; label: string; swatch?: Domain }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  /** 選項很多時（例如 65 個標籤）改用可捲動的容器。 */
  scrollable?: boolean;
};

function ToggleGroup<T extends string | number>({
  title,
  options,
  selected,
  onToggle,
  scrollable = false,
}: ToggleGroupProps<T>) {
  return (
    <fieldset className="border-t border-line pt-4">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-ink-dim uppercase">
        {title}
      </legend>
      <div className={`flex flex-wrap gap-1.5 ${scrollable ? 'max-h-44 overflow-y-auto pr-1' : ''}`}>
        {options.map((option) => {
          const isOn = selected.includes(option.value);
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={isOn}
              onClick={() => onToggle(option.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                isOn
                  ? 'border-accent bg-accent/15 text-accent-soft'
                  : 'border-line bg-surface-1 text-ink-dim hover:border-surface-3 hover:text-ink'
              }`}
            >
              {option.swatch && <DomainDot domain={option.swatch} />}
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FilterPanel({
  taxonomy,
  filters,
  lang,
  onChange,
}: {
  taxonomy: Taxonomy;
  filters: Filters;
  lang: TextLang;
  onChange: (next: Filters) => void;
}) {
  const strings = t(lang);

  /** 通用的多選切換：已選則移除，未選則加入。 */
  const toggle = <K extends keyof Filters>(
    key: K,
    value: Filters[K] extends (infer U)[] ? U : never,
  ) => {
    const current = filters[key] as unknown as (typeof value)[];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...filters, [key]: next });
  };

  /** 標籤在三種語言下顯示各自的名稱，英文以外並附上英文原文方便對照。 */
  const tagLabel = (tag: string) => {
    const entry = taxonomy.tagLabels[tag];
    if (!entry || lang === 'en') return tag;
    return lang === 'zh-TW' ? entry.tw : entry.cn;
  };

  return (
    <div className="space-y-4">
      {/*
        「特殊標記」刻意放在最上面。

        它不是官方分類（卡種、領域那些是官方 API 給的），而是要另外查資料
        才知道的事 —— 但這兩件正好是使用者最常想「只看這些」的：
        組牌前先確認哪些不能帶、復盤時要找衍生物長什麼樣。
        埋在一堆官方分類下面等於沒做。
      */}
      <ToggleGroup
        title={strings.filterMarks}
        options={MARKS.map((mark) => ({
          value: mark,
          label:
            mark === 'banned'
              ? strings.markBanned
              : mark === 'errata'
                ? strings.markErrata
                : strings.markToken,
        }))}
        selected={filters.marks}
        onToggle={(v) => toggle('marks', v)}
      />

      <ToggleGroup
        title={strings.filterSet}
        options={taxonomy.sets.map((set) => ({
          value: set.id,
          label: `${SET_LABELS[set.id][lang]} (${set.count})`,
        }))}
        selected={filters.sets}
        onToggle={(v) => toggle('sets', v)}
      />

      <ToggleGroup
        title={strings.filterType}
        options={taxonomy.types.map((type) => ({ value: type, label: TYPE_LABELS[type][lang] }))}
        selected={filters.types}
        onToggle={(v) => toggle('types', v)}
      />

      <ToggleGroup
        title={strings.filterDomain}
        options={taxonomy.domains.map((domain) => ({
          value: domain,
          label: DOMAIN_LABELS[domain][lang],
          swatch: domain,
        }))}
        selected={filters.domains}
        onToggle={(v) => toggle('domains', v)}
      />

      <ToggleGroup
        title={strings.filterRarity}
        options={taxonomy.rarities.map((rarity) => ({
          value: rarity,
          label: RARITY_LABELS[rarity][lang],
        }))}
        selected={filters.rarities}
        onToggle={(v) => toggle('rarities', v)}
      />

      <ToggleGroup
        title={strings.filterEnergy}
        options={taxonomy.energies.map((n) => ({ value: n, label: String(n) }))}
        selected={filters.energies}
        onToggle={(v) => toggle('energies', v)}
      />

      <ToggleGroup
        title={strings.filterMight}
        options={taxonomy.mights.map((n) => ({ value: n, label: String(n) }))}
        selected={filters.mights}
        onToggle={(v) => toggle('mights', v)}
      />

      <ToggleGroup
        title={strings.filterTags(taxonomy.tags.length)}
        options={taxonomy.tags.map((tag) => ({ value: tag, label: tagLabel(tag) }))}
        selected={filters.tags}
        onToggle={(v) => toggle('tags', v)}
        scrollable
      />
    </div>
  );
}
