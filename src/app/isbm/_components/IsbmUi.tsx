import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./IsbmUi.module.css";

export { styles as isbmStyles };

export function IsbmStats({ items }: { items: { label: string; value: ReactNode; detail: string; icon: LucideIcon; tone?: "success" | "warning" }[] }) {
  return (
    <div className={styles.stats}>
      {items.map(({ label, value, detail, icon: Icon, tone }) => (
        <div key={label} className={styles.stat} data-tone={tone}>
          <div className={styles.statTop}><span>{label}</span><Icon size={18} aria-hidden="true" /></div>
          <p className={styles.statValue}>{value}</p>
          <p className={styles.statDetail}>{detail}</p>
        </div>
      ))}
    </div>
  );
}

export function IsbmTableHeading({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return <div className={styles.tableHeading}><div><h2>{title}</h2>{count !== undefined && <span className={styles.count}>{count}</span>}</div>{children && <p>{children}</p>}</div>;
}

export function IsbmEmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return <div className={styles.empty}><div className={styles.emptyIcon}><Icon size={24} aria-hidden="true" /></div><h3>{title}</h3><p>{children}</p></div>;
}

export function IsbmFilter({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.filter}><span className={styles.filterLabel}>{label}</span>{children}</div>;
}
