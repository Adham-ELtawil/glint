/// A single inclusive byte range, as in `Content-Range: bytes start-end/size`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteRange {
    pub start: u64,
    pub end_inclusive: u64,
}

impl ByteRange {
    pub fn length(self) -> u64 {
        self.end_inclusive - self.start + 1
    }
}

/// Parse one `Range` header value (`bytes=start-end`) against a known file size.
/// Multi-range requests use the first range only, which is what media elements send.
pub fn parse_byte_range(header: &str, size: u64) -> Result<ByteRange, ()> {
    if size == 0 {
        return Err(());
    }
    let header = header.trim();
    let Some(rest) = header.strip_prefix("bytes=") else {
        return Err(());
    };
    let spec = rest.split(',').next().unwrap_or("").trim();
    if spec.is_empty() {
        return Err(());
    }

    if let Some(suffix) = spec.strip_prefix('-') {
        let n: u64 = suffix.parse().map_err(|_| ())?;
        if n == 0 {
            return Err(());
        }
        let n = n.min(size);
        return Ok(ByteRange {
            start: size - n,
            end_inclusive: size - 1,
        });
    }

    let Some((start_text, end_text)) = spec.split_once('-') else {
        return Err(());
    };
    let start: u64 = start_text.parse().map_err(|_| ())?;
    if start >= size {
        return Err(());
    }
    let end_inclusive = if end_text.is_empty() {
        size - 1
    } else {
        let end: u64 = end_text.parse().map_err(|_| ())?;
        end.min(size - 1)
    };
    if end_inclusive < start {
        return Err(());
    }
    Ok(ByteRange {
        start,
        end_inclusive,
    })
}

#[cfg(test)]
mod tests {
    use super::{ByteRange, parse_byte_range};

    #[test]
    fn parses_open_closed_and_suffix_ranges() {
        assert_eq!(
            parse_byte_range("bytes=0-4", 16),
            Ok(ByteRange {
                start: 0,
                end_inclusive: 4
            })
        );
        assert_eq!(
            parse_byte_range("bytes=4-", 16),
            Ok(ByteRange {
                start: 4,
                end_inclusive: 15
            })
        );
        assert_eq!(
            parse_byte_range("bytes=-4", 16),
            Ok(ByteRange {
                start: 12,
                end_inclusive: 15
            })
        );
        assert_eq!(
            parse_byte_range("bytes=4-9, 10-12", 16),
            Ok(ByteRange {
                start: 4,
                end_inclusive: 9
            })
        );
        assert!(parse_byte_range("bytes=20-30", 16).is_err());
        assert!(parse_byte_range("bytes=0-1", 0).is_err());
        assert!(parse_byte_range("items=0-1", 16).is_err());
    }
}
