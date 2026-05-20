export default function ReservationCalendar({ checkIn, checkOut, onCheckInChange, onCheckOutChange }) {
  const today = new Date().toISOString().slice(0, 10);
  const nights =
    checkIn && checkOut && checkOut > checkIn
      ? Math.round(
          (Date.parse(checkOut + "T00:00:00") - Date.parse(checkIn + "T00:00:00")) / 86_400_000,
        )
      : 0;

  return (
    <div className="grp-calendar">
      <div className="grp-date-group">
        <label className="grp-label">Check-in</label>
        <input
          type="date"
          className="grp-input"
          min={today}
          value={checkIn}
          onChange={(e) => onCheckInChange(e.target.value)}
        />
      </div>
      <div className="grp-date-group">
        <label className="grp-label">Check-out</label>
        <input
          type="date"
          className="grp-input"
          min={checkIn || today}
          value={checkOut}
          onChange={(e) => onCheckOutChange(e.target.value)}
        />
      </div>
      {nights > 0 && (
        <div className="grp-nights-pill">
          {nights} night{nights !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
