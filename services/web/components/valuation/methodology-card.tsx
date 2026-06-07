interface MethodologyCardProps {
  paragraphs: string[];
}

export function MethodologyCard({ paragraphs }: MethodologyCardProps) {
  return (
    <div className="val-card">
      <h3 className="val-card-title">Methodology</h3>
      <div className="val-prose space-y-2">
        {paragraphs.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </div>
  );
}
