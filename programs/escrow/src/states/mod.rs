pub mod escrow;
pub use escrow::*;


// Rust-analyzer is complaining “file is not included in the module tree” because:
// You declared pub mod escrow; inside states/mod.rs 
// But you never told Rust about states/mod.rs itself in your root lib.rs.
// So initialize.rs and escrow.rs are floating around but Rust doesn’t know how to reach them unless you wire them up in the module tree.