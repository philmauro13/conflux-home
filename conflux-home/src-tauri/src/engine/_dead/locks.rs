// Advisory file locking for session state

use std::fs::{File, OpenOptions};
use std::path::Path;
use fs2::FileExt;
use std::sync::{Arc, Mutex};

pub struct FileLockManager {
    locks: Arc<Mutex<std::collections::HashMap<String, File>>>,
}

impl FileLockManager {
    pub fn new() -> Self {
        Self {
            locks: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    /// Acquire exclusive lock on a file. Blocks until acquired.
    pub fn lock_exclusive(&self, path: &Path) -> std::io::Result<()> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(path)?;
        
        file.lock_exclusive()?;
        
        let mut locks = self.locks.lock().unwrap();
        locks.insert(path.to_string_lossy().to_string(), file);
        
        Ok(())
    }

    /// Acquire shared lock on a file. Blocks until acquired.
    pub fn lock_shared(&self, path: &Path) -> std::io::Result<()> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(path)?;
        
        file.lock_shared()?;
        
        let mut locks = self.locks.lock().unwrap();
        locks.insert(path.to_string_lossy().to_string(), file);
        
        Ok(())
    }

    /// Release lock on a file.
    pub fn unlock(&self, path: &Path) -> std::io::Result<()> {
        let path_str = path.to_string_lossy().to_string();
        let mut locks = self.locks.lock().unwrap();
        
        if let Some(file) = locks.remove(&path_str) {
            file.unlock()?;
        }
        
        Ok(())
    }

    /// Check if a lock is held.
    pub fn is_locked(&self, path: &Path) -> bool {
        let locks = self.locks.lock().unwrap();
        locks.contains_key(&path.to_string_lossy().to_string())
    }
}

impl Drop for FileLockManager {
    fn drop(&mut self) {
        // Release all held locks
        let mut locks = self.locks.lock().unwrap();
        for (path, file) in locks.drain() {
            let _ = file.unlock();
        }
    }
}
