=== AI Chat Widget ===
Requires at least: 5.0
Requires PHP: 7.2
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed your dashboard-hosted AI chat widget on this WordPress site.

== Description ==

A thin loader for the AI chat widget. It adds the widget's script tag to your
site's front end. All configuration — branding, greeting, model, allowed
domains, and the AI/booking behaviour — lives on your dashboard, so this plugin
never needs updating when the widget changes.

== Installation ==

1. In wp-admin, go to Plugins → Add New → Upload Plugin and upload
   `ai-chat-widget.zip`.
2. Activate the plugin.
3. Go to Settings → AI Chat Widget and enter:
   - Business ID        (from your dashboard's Chat Widget settings)
   - Embed Key          (from your dashboard's Chat Widget settings)
   - Widget service URL  (shown on the same dashboard settings page)
4. Check "Enable widget" and Save.
5. In your dashboard's Chat Widget settings, add this site's domain to the
   Allowed website domains list. The widget will not appear until you do.

== Frequently Asked Questions ==

= The widget isn't showing up =

Confirm all of: the plugin is enabled, the Business ID and Embed Key are
correct, and this site's exact domain (shown on the settings page) is in the
Allowed website domains list in your dashboard.

== Changelog ==

= 1.0.0 =
* Initial release.
