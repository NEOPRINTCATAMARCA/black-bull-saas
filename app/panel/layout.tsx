import type { ReactNode } from "react";

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        .bb-panel-fit {
          width: 100%;
          min-width: 0;
        }

        @media (min-width: 1200px) {
          .bb-panel-fit {
            zoom: 0.88;
            width: 113.64%;
          }
        }
      `}</style>

      <div className="bb-panel-fit">{children}</div>
    </>
  );
}
