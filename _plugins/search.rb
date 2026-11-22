require 'json'
require 'nokogiri'

# The site search: writes /search.json, a record per page and per ## section,
# for the search in assets/site.js (MiniSearch). Covers the docs copied in by
# scripts/fetch-docs.sh (modules/, current/modules/, contribute/) and the
# sections of the homepage.
#
# A record:
#   url        the page, or the section as page#heading-id
#   title      the page title, or the section heading
#   page       the page title (the same for all records of a page)
#   label      shown above the page title: the module's category on its main
#              page, the module name on its other pages, "Developer docs"
#   line       "lts" (modules/), "current" (current/modules/) or "" (both)
#   text       the module description, on a module's main page
#   keywords   artifact id, tags and category label of a module
#   apis       class names mentioned in code
#   body       the text
module SiteSearch
  def self.records
    @records ||= []
  end

  def self.text(nodes)
    nodes.map(&:text).join(' ').gsub(/\s+/, ' ').strip
  end

  # Class names mentioned in code within the nodes, e.g. ModalContentWindow.
  def self.identifiers(nodes)
    nodes.flat_map { |n| n.css('code').map(&:text) + (n.name == 'code' ? [n.text] : []) }
         .flat_map { |t| t.scan(/\b[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*\b/) }
         .uniq.first(30)
  end

  # Splits a rendered docs page into its intro and its ## sections.
  def self.index_doc(page)
    site = page.site
    data = page.data
    line = { 'modules' => 'lts', 'current' => 'current' }[data['section']] || ''
    if data['section'] == 'contribute'
      label = 'Developer docs'
    elsif page.name == 'index.md'
      label = site.config.dig('module_categories', data['category']) || 'Module'
    else
      index = site.pages.find { |p| p.dir == page.dir && p.name == 'index.md' }
      label = index ? index.data['title'].to_s : ''
    end
    keywords = [data['artifactId'], data['tags']]
    keywords << site.config.dig('module_categories', data['category']) if page.name == 'index.md'
    common = { 'page' => data['title'].to_s, 'label' => label, 'line' => line }

    html = Nokogiri::HTML::DocumentFragment.parse(page.content)
    sections = [[nil, []]]
    html.children.each do |node|
      if node.name == 'h2'
        sections << [node, []]
      elsif node.name != 'h1'
        sections.last[1] << node
      end
    end

    intro = sections.shift[1]
    records << common.merge('url' => page.url, 'title' => data['title'].to_s,
                            'text' => data['description'].to_s,
                            'keywords' => keywords.compact.join(' '),
                            'apis' => identifiers(intro).join(' '), 'body' => text(intro))
    sections.each do |heading, nodes|
      next unless heading['id']
      records << common.merge('url' => "#{page.url}##{heading['id']}", 'title' => heading.text.strip,
                              'text' => '', 'keywords' => '',
                              'apis' => identifiers(nodes).join(' '), 'body' => text(nodes))
    end
  end

  # Not searched on the homepage: the module cards (every module has its own
  # records), and controls and buttons.
  HOME_SKIP = '.hero-code, .catalog-tools, #module-list, #module-more, #module-status, #module-empty, ' \
              '.actions, .bom-switch, script'.freeze

  # The homepage: the hero, and a record per section with an id.
  def self.index_home(page)
    html = Nokogiri::HTML(page.content)
    main = html.at_css('main') or return
    main.css(HOME_SKIP).each(&:remove)
    common = { 'page' => 'Wicket Stuff homepage', 'label' => '', 'line' => '', 'text' => '', 'keywords' => '' }
    hero = main.at_css('.hero')
    if hero
      records << common.merge('url' => '/', 'title' => 'Wicket Stuff homepage',
                              'apis' => '', 'body' => text([hero]))
    end
    # Sections, and panels with their own id (#security) as records of their own.
    parts = main.css('section[id]').to_a
    panels = main.css('section[id] [id]').select { |n| n.at_css('h2, h3') }
    panels.each(&:unlink)
    (parts + panels).each do |part|
      heading = part.at_css('h2, h3') or next
      records << common.merge('url' => "/##{part['id']}", 'title' => heading.text.strip,
                              'apis' => identifiers([part]).join(' '), 'body' => text([part]))
    end
  end
end

Jekyll::Hooks.register :site, :pre_render do |_site|
  SiteSearch.records.clear
end

Jekyll::Hooks.register :pages, :post_convert do |page|
  if %w[modules current contribute].include?(page.data['section'])
    SiteSearch.index_doc(page)
  elsif page.url == '/'
    SiteSearch.index_home(page)
  end
end

Jekyll::Hooks.register :site, :post_write do |site|
  records = SiteSearch.records.sort_by { |r| r['url'] }.each_with_index.map { |r, i| { 'id' => i }.merge(r) }
  File.write(File.join(site.dest, 'search.json'), JSON.generate(records))
end
