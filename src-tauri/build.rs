fn main() {
    // GLINT_STORE=1 builds the Microsoft Store package, whose frontend hides
    // the updater. Refuse to pair it with a binary that still has one.
    println!("cargo:rerun-if-env-changed=GLINT_STORE");
    let store = std::env::var("GLINT_STORE").is_ok_and(|value| value.trim() == "1");
    let self_update = std::env::var_os("CARGO_FEATURE_SELF_UPDATE").is_some();
    if store && self_update {
        panic!(
            "GLINT_STORE=1 needs the updater left out: build with --no-default-features \
             (the Microsoft Store installs Glint's updates)"
        );
    }
    tauri_build::build()
}
