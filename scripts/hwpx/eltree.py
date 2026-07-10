from __future__ import annotations

import xml.etree.ElementTree as ET


class ParentIndex:
    """Owns a child->parent map for an ElementTree root and provides insert
    helpers that keep the map consistent automatically.

    ElementTree has no parent pointers, so paragraph insertion needs a parent
    map to compute positions. This class centralizes that map plus the
    "insert then re-index descendants" bookkeeping that was previously
    hand-copied at every insertion site in apply_smart_replacements.
    """

    def __init__(self, root: ET.Element) -> None:
        self._parent: dict[ET.Element, ET.Element] = {
            child: parent for parent in root.iter() for child in parent
        }

    def parent_of(self, el: ET.Element) -> ET.Element | None:
        return self._parent.get(el)

    def insert_after(self, anchor: ET.Element, new_el: ET.Element) -> ET.Element:
        """Insert ``new_el`` immediately after ``anchor`` within anchor's parent,
        register ``new_el`` (and its descendants) in the map, and return it.

        Raises KeyError if ``anchor`` has no known parent; callers guard with
        :meth:`parent_of` first (mirroring the original ``parent is not None``
        checks).
        """
        parent = self._parent[anchor]
        parent.insert(list(parent).index(anchor) + 1, new_el)
        self._track(new_el, parent)
        return new_el

    def _track(self, el: ET.Element, parent: ET.Element) -> None:
        self._parent[el] = parent
        for child in el.iter():
            for grand in child:
                self._parent[grand] = child
