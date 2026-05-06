export const metadata = {
  title: "Settings — SoloDesk",
};

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          Settings
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
      </header>
      <p className="text-sm text-ink-mute">No settings yet.</p>
    </div>
  );
}
