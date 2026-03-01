from Bio import PDB


# Common non-ligand HETATM residue names to exclude
NON_LIGAND_HETATM = {"HOH", "WAT", "DOD", "SO4", "PO4", "GOL", "EDO", "ACE", "NH2", "NAG",
                      "MAN", "BMA", "FUC", "GAL", "CL", "NA", "MG", "ZN", "CA", "K", "FE",
                      "CU", "MN", "CO", "NI", "CD", "IOD"}


def parse_pdb(filepath: str) -> dict:
    """Parse a PDB file and extract chains, residue counts, atoms, ligands, and header info."""
    parser = PDB.PDBParser(QUIET=True)
    structure = parser.get_structure("protein", filepath)

    chains = []
    total_residues = 0
    total_atoms = 0
    ligands = []

    for model in structure:
        for chain in model:
            residues = list(chain.get_residues())
            # Filter HETATM residues (non-standard)
            std_residues = [r for r in residues if r.id[0] == " "]
            hetatm = [r for r in residues if r.id[0] != " "]
            atoms = list(chain.get_atoms())
            total_residues += len(std_residues)
            total_atoms += len(atoms)
            chains.append(
                {
                    "chain_id": chain.id,
                    "residue_count": len(std_residues),
                    "hetatm_count": len(hetatm),
                    "atom_count": len(atoms),
                    "sequence": _get_sequence(std_residues),
                }
            )

            # Detect crystal ligands (non-water HETATM)
            for r in hetatm:
                resname = r.resname.strip()
                if resname in NON_LIGAND_HETATM:
                    continue
                if r.id[0] not in ("H_", " ") and r.id[0] != "W":
                    lig_atoms = list(r.get_atoms())
                    if len(lig_atoms) >= 3:  # meaningful ligand, not just ions
                        center = _residue_center(lig_atoms)
                        ligands.append({
                            "name": resname,
                            "chain": chain.id,
                            "resi": r.id[1],
                            "atom_count": len(lig_atoms),
                            "center": center,
                        })

    header = structure.header
    return {
        "name": header.get("name", "Unknown"),
        "organism": header.get("source", {}).get("1", {}).get("organism_scientific", "Unknown"),
        "resolution": header.get("resolution"),
        "chains": chains,
        "total_residues": total_residues,
        "total_atoms": total_atoms,
        "ligands": ligands,
    }


def _residue_center(atoms) -> dict:
    """Compute the centroid of a list of atoms."""
    xs = [a.get_vector()[0] for a in atoms]
    ys = [a.get_vector()[1] for a in atoms]
    zs = [a.get_vector()[2] for a in atoms]
    return {
        "x": float(sum(xs) / len(xs)),
        "y": float(sum(ys) / len(ys)),
        "z": float(sum(zs) / len(zs)),
    }


def _get_sequence(residues: list) -> str:
    aa_map = {
        "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
        "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
        "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
        "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
    }
    return "".join(aa_map.get(r.resname, "X") for r in residues)
