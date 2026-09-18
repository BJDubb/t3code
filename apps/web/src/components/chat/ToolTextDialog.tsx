import { Dialog, DialogPopup, DialogHeader, DialogTitle } from "../ui/dialog";
import { ToolCopyButton, ToolTextBlock } from "./ToolTextBlock";

export function ToolTextDialog({
  title,
  text,
  language,
  theme,
  onClose,
}: {
  title: string;
  text: string;
  language: string;
  theme: "light" | "dark";
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup
        className="flex max-h-[85dvh] w-[min(72rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden"
        bottomStickOnMobile={false}
      >
        <DialogHeader className="shrink-0 pr-12">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end px-5">
          <ToolCopyButton text={text} />
        </div>
        <div className="min-h-0 overflow-auto px-6 pb-6">
          <ToolTextBlock text={text} language={language} theme={theme} preview={false} />
        </div>
      </DialogPopup>
    </Dialog>
  );
}
