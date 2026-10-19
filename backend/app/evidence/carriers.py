# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""What carries a rule in an SPDX 3 SBOM: a probe name and its params.

Most probes of the checker's spec already name SPDX 3 properties or
relationships (``require_property``, ``require_hash``, ``require_relationship``,
``require_contact``, ``require_document_property``,
``require_document_contact``), and their params are used as they are.  The two
attribute probes name an abstract element (``supplier``, ``timestamp``)
instead: the tables below mirror how the checker's SPDX 3 adapter
(``ntia_conformance_checker/adapters/spdx3_adapter.py``) reads each one, as
one of the probes above or as one of two document-level carriers of its own
(``sbom_type``, ``dependency_relationship``).  An attribute missing here (one
the adapter does not read for SPDX 3) has no carrier: its rule gets element
evidence without items.

See also :mod:`app.evidence.reader`, which reads each carrier on an element.
"""

from __future__ import annotations

from typing import Any

from ntia_conformance_checker.adapters.spdx3_adapter import IDENTIFIER_PROPERTIES
from ntia_conformance_checker.spec import ProbeRef

Carrier = tuple[str, dict[str, Any]]
"""A probe name and its params; the name is ``""`` when the carrier is unknown."""

DOCUMENT_PROBES = ("require_document_property", "require_document_contact")

# require_component_attribute: attribute -> what Spdx3Adapter reads
# (get_components_without_<attribute>), on reachable software packages.
_COMPONENT_ATTRIBUTES: dict[str, Carrier] = {
    "name": ("require_property", {"kind": "component", "properties": ["name"]}),
    "version": (
        "require_property",
        {"kind": "component", "properties": ["software_packageVersion"]},
    ),
    "supplier": (
        "require_property",
        {"kind": "component", "properties": ["suppliedBy"]},
    ),
    "unique_identifier": (
        "require_property",
        {"kind": "component", "properties": list(IDENTIFIER_PROPERTIES)},
    ),
    "copyright_notice": (
        "require_property",
        {"kind": "component", "properties": ["software_copyrightText"]},
    ),
    "concluded_license": (
        "require_relationship",
        {"kind": "component", "relationships": ["hasConcludedLicense"]},
    ),
}

# require_document_attribute: attribute -> what Spdx3Adapter reads
# (check_author, check_timestamp, get_doc_spec_version, get_sbom_types,
# check_dependency_relationships).
_DOCUMENT_ATTRIBUTES: dict[str, Carrier] = {
    "author": ("require_document_property", {"properties": ["createdBy"]}),
    "timestamp": ("require_document_property", {"properties": ["created"]}),
    "spec_version": ("require_document_property", {"properties": ["specVersion"]}),
    "sbom_type": ("sbom_type", {}),
    "dependency_relationship": ("dependency_relationship", {}),
}

CREATION_INFO_PROPERTIES = frozenset(
    {"comment", "created", "createdBy", "createdUsing", "specVersion"}
)
"""SPDX 3 ``CreationInfo`` properties a document-level rule can ask for."""


def carrier(probe: ProbeRef) -> Carrier:
    """What carries a rule with *probe*."""
    attribute = str(probe.params.get("attribute", ""))
    if probe.name == "require_component_attribute":
        return _COMPONENT_ATTRIBUTES.get(attribute, ("", {"kind": "component"}))
    if probe.name == "require_document_attribute":
        return _DOCUMENT_ATTRIBUTES.get(attribute, ("", {}))
    return probe.name, dict(probe.params)


def on_creation_info(found: Carrier) -> bool:
    """Whether a document-level carrier names only creation info properties."""
    name, params = found
    return name in DOCUMENT_PROBES and set(params["properties"]) <= (
        CREATION_INFO_PROPERTIES
    )
