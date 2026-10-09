"use client";
import QRCode from "react-qr-code";
import { BottomSheet, CopyButton } from "../ui";

/**
 * Receiving money (PLAN §3 step 5, Mom's side): the account as a QR for Send's scanner, and the
 * same text to copy for someone typing it in. The `0x` address lives here and nowhere else on the
 * Account tab, because this is the one place someone needs it.
 */
export function ReceiveSheet({
  open,
  onClose,
  address,
}: {
  open: boolean;
  onClose: () => void;
  address: string;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Receive money">
      <h2 className="mb-1 text-xl font-semibold">Receive money</h2>
      <p className="mb-5 text-sm text-muted">
        Let them scan this in Matocard, or send them the account below.
      </p>
      <div className="mx-auto mb-5 w-fit rounded-[20px] border border-line bg-white p-4">
        <QRCode value={address} size={184} bgColor="#ffffff" fgColor="#111316" />
      </div>
      <div className="flex items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-muted">Your Matocard account</div>
          <div className="mt-0.5 break-all font-mono text-[12.5px] text-ink-2">{address}</div>
        </div>
        <CopyButton value={address} label="Copy your account" />
      </div>
    </BottomSheet>
  );
}
