export default function SoftLockWrapper({ locked, children, title }) {
  const className = locked ? 'faded-entity' : '';
  return (
    <div className={className} title={locked ? (title || 'Locked: parent course is inactive') : undefined}>
      {children}
    </div>
  );
}
