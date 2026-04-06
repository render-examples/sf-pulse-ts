-- HTML-escape persisted event titles so downstream HTML/XML consumers
-- never receive raw event names with special characters.
-- Preserve titles already escaped with the app's standard entity set.

UPDATE events
SET title = escaped.escaped_title
FROM (
  SELECT
    id,
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(
                              replace(
                                replace(
                                  title,
                                  '&amp;',
                                  '@@__SFP_AMP__@@'
                                ),
                                '&lt;',
                                '@@__SFP_LT__@@'
                              ),
                              '&gt;',
                              '@@__SFP_GT__@@'
                            ),
                            '&quot;',
                            '@@__SFP_QUOT__@@'
                          ),
                          '&#39;',
                          '@@__SFP_APOS__@@'
                        ),
                        '&',
                        '&amp;'
                      ),
                      '<',
                      '&lt;'
                    ),
                    '>',
                    '&gt;'
                  ),
                  '"',
                  '&quot;'
                ),
                '''',
                '&#39;'
              ),
              '@@__SFP_AMP__@@',
              '&amp;'
            ),
            '@@__SFP_LT__@@',
            '&lt;'
          ),
          '@@__SFP_GT__@@',
          '&gt;'
        ),
        '@@__SFP_QUOT__@@',
        '&quot;'
      ),
      '@@__SFP_APOS__@@',
      '&#39;'
    ) AS escaped_title
  FROM events
) AS escaped
WHERE events.id = escaped.id
  AND events.title <> escaped.escaped_title;

UPDATE data_updates
SET item_name = escaped.escaped_title
FROM (
  SELECT
    id,
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(
                              replace(
                                replace(
                                  item_name,
                                  '&amp;',
                                  '@@__SFP_AMP__@@'
                                ),
                                '&lt;',
                                '@@__SFP_LT__@@'
                              ),
                              '&gt;',
                              '@@__SFP_GT__@@'
                            ),
                            '&quot;',
                            '@@__SFP_QUOT__@@'
                          ),
                          '&#39;',
                          '@@__SFP_APOS__@@'
                        ),
                        '&',
                        '&amp;'
                      ),
                      '<',
                      '&lt;'
                    ),
                    '>',
                    '&gt;'
                  ),
                  '"',
                  '&quot;'
                ),
                '''',
                '&#39;'
              ),
              '@@__SFP_AMP__@@',
              '&amp;'
            ),
            '@@__SFP_LT__@@',
            '&lt;'
          ),
          '@@__SFP_GT__@@',
          '&gt;'
        ),
        '@@__SFP_QUOT__@@',
        '&quot;'
      ),
      '@@__SFP_APOS__@@',
      '&#39;'
    ) AS escaped_title
  FROM data_updates
  WHERE type = 'event'
) AS escaped
WHERE data_updates.id = escaped.id
  AND data_updates.item_name <> escaped.escaped_title;
