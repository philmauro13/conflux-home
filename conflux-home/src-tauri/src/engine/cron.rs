// Conflux Engine — Cron Expression Parser
// Supports standard 5-field cron: minute hour day month weekday
// Examples: */5 * * * * (every 5 min), 0 9 * * 1-5 (weekdays at 9am)

use chrono::{Utc, Timelike, Datelike, Duration};

/// Parse a cron expression and compute the next run time after `after`.
pub fn next_run(schedule: &str, after: chrono::DateTime<Utc>) -> Option<chrono::DateTime<Utc>> {
    let fields: Vec<&str> = schedule.split_whitespace().collect();
    if fields.len() != 5 {
        return None;
    }

    let minutes = parse_field(fields[0], 0, 59);
    let hours = parse_field(fields[1], 0, 23);
    let days = parse_field(fields[2], 1, 31);
    let months = parse_field(fields[3], 1, 12);
    let weekdays = parse_field(fields[4], 0, 6);

    // Start searching from the next minute
    let mut candidate = after
        .checked_add_signed(Duration::minutes(1))?
        .with_second(0)?
        .with_nanosecond(0)?;

    // Search up to 2 years ahead
    let limit = after + Duration::days(730);

    while candidate < limit {
        if months.contains(&(candidate.month() as u32))
            && days.contains(&(candidate.day() as u32))
            && weekdays.contains(&candidate.weekday().num_days_from_sunday())
            && hours.contains(&(candidate.hour() as u32))
            && minutes.contains(&(candidate.minute() as u32))
        {
            return Some(candidate);
        }
        candidate = candidate.checked_add_signed(Duration::minutes(1))?;
    }

    None
}

/// Parse a cron field (e.g., "*/5", "1-3", "1,3,5", "*", "5")
fn parse_field(field: &str, min: u32, max: u32) -> Vec<u32> {
    let mut result = Vec::new();

    for part in field.split(',') {
        if part == "*" {
            result.extend(min..=max);
        } else if let Some(step_str) = part.strip_prefix("*/") {
            if let Ok(step) = step_str.parse::<u32>() {
                if step > 0 {
                    let start = min;
                    let mut val = start;
                    while val <= max {
                        result.push(val);
                        val += step;
                    }
                }
            }
        } else if let Some((start_str, end_str)) = part.split_once('-') {
            if let (Ok(start), Ok(end)) = (start_str.parse::<u32>(), end_str.parse::<u32>()) {
                for v in start..=end.min(max) {
                    if v >= min {
                        result.push(v);
                    }
                }
            }
        } else if let Ok(val) = part.parse::<u32>() {
            if val >= min && val <= max {
                result.push(val);
            }
        }
    }

    result.sort();
    result.dedup();
    result
}

/// Format a cron expression as human-readable text.
pub fn describe(schedule: &str) -> String {
    let fields: Vec<&str> = schedule.split_whitespace().collect();
    if fields.len() != 5 {
        return format!("Invalid cron: {}", schedule);
    }

    let min = fields[0];
    let hour = fields[1];
    let day = fields[2];
    let month = fields[3];
    let weekday = fields[4];

    // Common patterns
    if min == "*/5" && hour == "*" && day == "*" && month == "*" && weekday == "*" {
        return "Every 5 minutes".to_string();
    }
    if min == "*/15" && hour == "*" && day == "*" && month == "*" && weekday == "*" {
        return "Every 15 minutes".to_string();
    }
    if min == "*/30" && hour == "*" && day == "*" && month == "*" && weekday == "*" {
        return "Every 30 minutes".to_string();
    }
    if min == "0" && hour == "*" && day == "*" && month == "*" && weekday == "*" {
        return "Every hour".to_string();
    }
    if min == "0" && hour.starts_with("*/") && day == "*" && month == "*" && weekday == "*" {
        let n = &hour[2..];
        return format!("Every {} hours", n);
    }
    if day == "*" && month == "*" && weekday == "*" {
        return format!("Daily at {}:{:0>2}", hour, min);
    }
    if day == "*" && month == "*" && weekday != "*" {
        let days = match weekday {
            "1-5" => "weekdays",
            "0,6" => "weekends",
            "0" => "Sundays",
            "1" => "Mondays",
            "6" => "Saturdays",
            _ => "on specific days",
        };
        return format!("{} at {}:{:0>2}", days, hour, min);
    }

    format!("{} {} {} {} {}", min, hour, day, month, weekday)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_every_5_min() {
        let after = Utc.with_ymd_and_hms(2026, 3, 22, 10, 0, 0).unwrap();
        let next = next_run("*/5 * * * *", after).unwrap();
        assert_eq!(next.minute(), 5);
    }

    #[test]
    fn test_daily_at_9() {
        let after = Utc.with_ymd_and_hms(2026, 3, 22, 10, 0, 0).unwrap();
        let next = next_run("0 9 * * *", after).unwrap();
        assert_eq!(next.day(), 23);
        assert_eq!(next.hour(), 9);
    }

    #[test]
    fn test_weekdays() {
        // March 22, 2026 is a Sunday (weekday 0)
        let after = Utc.with_ymd_and_hms(2026, 3, 22, 10, 0, 0).unwrap();
        let next = next_run("0 9 * * 1-5", after).unwrap();
        // Should be Monday March 23 at 9am
        assert_eq!(next.day(), 23);
        assert_eq!(next.hour(), 9);
    }
}
