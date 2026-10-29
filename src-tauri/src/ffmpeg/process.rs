//! Starting ffmpeg/ffprobe: no console window, and never outliving Glint.

use std::path::Path;

/// `CREATE_NO_WINDOW`: console tools would otherwise flash a terminal window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn std_command(program: &Path) -> std::process::Command {
    #[allow(unused_mut)]
    let mut command = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// For streaming sessions. Dropping the child kills it (`kill_on_drop`).
pub fn tokio_command(program: &Path) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(program);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command.kill_on_drop(true);
    command
}

/// Puts a running child in Glint's job object, so Windows kills it when Glint
/// exits for any reason, including a crash. A no-op elsewhere.
pub fn adopt(child: &tokio::process::Child) {
    #[cfg(windows)]
    if let Some(handle) = child.raw_handle() {
        job::assign(handle);
    }
    #[cfg(not(windows))]
    let _ = child;
}

/// Same as [`adopt`] for a blocking child.
pub fn adopt_std(child: &std::process::Child) {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        job::assign(child.as_raw_handle());
    }
    #[cfg(not(windows))]
    let _ = child;
}

#[cfg(windows)]
mod job {
    use std::ffi::c_void;
    use std::sync::OnceLock;

    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
        SetInformationJobObject,
    };

    /// The job handle as an integer so it can live in a static. Never closed:
    /// Windows closes it when Glint's process ends, which kills every child.
    static JOB: OnceLock<usize> = OnceLock::new();

    fn handle() -> Option<*mut c_void> {
        let raw = *JOB.get_or_init(|| unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return 0;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok == 0 { 0 } else { job as usize }
        });
        (raw != 0).then_some(raw as *mut c_void)
    }

    pub fn assign(process: *mut c_void) {
        if let Some(job) = handle() {
            unsafe {
                AssignProcessToJobObject(job, process);
            }
        }
    }
}
