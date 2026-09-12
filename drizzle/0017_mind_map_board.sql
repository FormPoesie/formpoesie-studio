ALTER TABLE mind_map_nodes ADD width real DEFAULT 240 NOT NULL;
ALTER TABLE mind_map_nodes ADD height real DEFAULT 150 NOT NULL;
ALTER TABLE mind_map_nodes ADD text_color text DEFAULT '#ffffff' NOT NULL;
ALTER TABLE mind_map_edges ADD color text;
