interface Props {
  text: string;
  date: string;
}

export default function HorizonInsightCard({ text, date }: Props) {
  return (
    <div className="horizon-insight-card">
      <div className="horizon-insight-icon">💡</div>
      <p className="horizon-insight-text">{text}</p>
      <span className="horizon-insight-date">{date}</span>
    </div>
  );
}
