use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(root, &path, out);
        } else if path.is_file() {
            if let Ok(rel) = path.strip_prefix(root) {
                let key = rel.to_string_lossy().replace('\\', "/");
                out.push((key, path));
            }
        }
    }
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let dist_dir = manifest_dir.join("..").join("..").join("dist");
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let dest = out_dir.join("embedded_web.rs");

    println!("cargo:rerun-if-changed={}", dist_dir.display());

    let mut files = Vec::new();
    if dist_dir.join("index.html").is_file() {
        collect_files(&dist_dir, &dist_dir, &mut files);
        files.sort_by(|a, b| a.0.cmp(&b.0));
        for (_, path) in &files {
            println!("cargo:rerun-if-changed={}", path.display());
        }
    }

    let mut out = fs::File::create(&dest).expect("failed to create embedded_web.rs");
    writeln!(out, "pub const HAS_EMBEDDED_WEB: bool = {};", !files.is_empty()).unwrap();
    writeln!(
        out,
        "pub fn get_embedded_asset(rel_path: &str) -> Option<&'static [u8]> {{"
    )
    .unwrap();
    writeln!(out, "    match rel_path {{").unwrap();
    for (key, abs_path) in &files {
        let canon = fs::canonicalize(abs_path).unwrap_or_else(|_| abs_path.clone());
        writeln!(
            out,
            "        {:?} => Some(include_bytes!({:?})),",
            key,
            canon.to_string_lossy()
        )
        .unwrap();
    }
    writeln!(out, "        _ => None,").unwrap();
    writeln!(out, "    }}").unwrap();
    writeln!(out, "}}").unwrap();
}
