<?php
/**
 * Plugin Name:       AI Chat Widget
 * Description:       Embeds your AI chat widget on this site. Enter the Business ID and Embed Key from your dashboard's Chat Widget settings.
 * Version:           1.0.0
 * Requires at least: 5.0
 * Requires PHP:      7.2
 * Author:            AI Chat Widget
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 *
 * This is a thin wrapper: it only injects the widget service's embed.js
 * <script> tag on the front end. All of the widget's behaviour, branding, and
 * AI/booking logic lives on the widget service + dashboard — nothing in this
 * plugin needs to change when the widget is updated.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

const AICW_OPTION = 'ai_chat_widget_settings';
// No default — the operator must enter the widget service URL (below).
const AICW_DEFAULT_HOST = '';

/**
 * Registered option shape: enabled, business_id, embed_key, host.
 */
function aicw_defaults() {
	return array(
		'enabled'     => '',
		'business_id' => '',
		'embed_key'   => '',
		'host'        => AICW_DEFAULT_HOST,
	);
}

function aicw_get_settings() {
	$saved = get_option( AICW_OPTION, array() );
	return wp_parse_args( is_array( $saved ) ? $saved : array(), aicw_defaults() );
}

add_action(
	'admin_init',
	function () {
		register_setting(
			'ai_chat_widget_group',
			AICW_OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => 'aicw_sanitize',
				'default'           => aicw_defaults(),
			)
		);
	}
);

/**
 * Sanitize every field before it's stored. business_id is digits only, host is
 * validated as an http(s) URL, embed_key is plain text.
 */
function aicw_sanitize( $input ) {
	$input = is_array( $input ) ? $input : array();

	$host = isset( $input['host'] ) ? esc_url_raw( trim( $input['host'] ), array( 'http', 'https' ) ) : '';
	if ( '' === $host ) {
		$host = AICW_DEFAULT_HOST;
	}

	return array(
		'enabled'     => empty( $input['enabled'] ) ? '' : '1',
		'business_id' => isset( $input['business_id'] ) ? preg_replace( '/[^0-9]/', '', $input['business_id'] ) : '',
		'embed_key'   => isset( $input['embed_key'] ) ? sanitize_text_field( $input['embed_key'] ) : '',
		'host'        => untrailingslashit( $host ),
	);
}

add_action(
	'admin_menu',
	function () {
		add_options_page(
			'AI Chat Widget',
			'AI Chat Widget',
			'manage_options',
			'ai-chat-widget',
			'aicw_render_settings_page'
		);
	}
);

// A "Settings" link on the Plugins list row for convenience.
add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		$url = admin_url( 'options-general.php?page=ai-chat-widget' );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'ai-chat-widget' ) . '</a>' );
		return $links;
	}
);

function aicw_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$settings = aicw_get_settings();
	?>
	<div class="wrap">
		<h1><?php echo esc_html__( 'AI Chat Widget', 'ai-chat-widget' ); ?></h1>
		<p>
			<?php echo esc_html__( 'Enter the Business ID and Embed Key shown on your dashboard under Settings → Chat Widget. Branding, greeting, and everything else are configured there.', 'ai-chat-widget' ); ?>
		</p>
		<form action="options.php" method="post">
			<?php settings_fields( 'ai_chat_widget_group' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php echo esc_html__( 'Enable widget', 'ai-chat-widget' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( AICW_OPTION ); ?>[enabled]" value="1" <?php checked( '1', $settings['enabled'] ); ?> />
							<?php echo esc_html__( 'Show the chat widget on this site', 'ai-chat-widget' ); ?>
						</label>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="aicw_business_id"><?php echo esc_html__( 'Business ID', 'ai-chat-widget' ); ?></label></th>
					<td>
						<input type="text" id="aicw_business_id" class="regular-text" name="<?php echo esc_attr( AICW_OPTION ); ?>[business_id]" value="<?php echo esc_attr( $settings['business_id'] ); ?>" />
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="aicw_embed_key"><?php echo esc_html__( 'Embed Key', 'ai-chat-widget' ); ?></label></th>
					<td>
						<input type="text" id="aicw_embed_key" class="regular-text" name="<?php echo esc_attr( AICW_OPTION ); ?>[embed_key]" value="<?php echo esc_attr( $settings['embed_key'] ); ?>" autocomplete="off" />
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="aicw_host"><?php echo esc_html__( 'Widget service URL', 'ai-chat-widget' ); ?></label></th>
					<td>
						<input type="url" id="aicw_host" class="regular-text" name="<?php echo esc_attr( AICW_OPTION ); ?>[host]" value="<?php echo esc_attr( $settings['host'] ); ?>" placeholder="https://chat.example.com" />
						<p class="description"><?php echo esc_html__( 'The URL of the chat widget service (shown on your dashboard\'s Chat Widget settings page).', 'ai-chat-widget' ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>

		<hr />
		<h2><?php echo esc_html__( 'One more step', 'ai-chat-widget' ); ?></h2>
		<p>
			<?php echo esc_html__( 'The widget only loads on domains you\'ve allow-listed in the dashboard. Add this site\'s domain there:', 'ai-chat-widget' ); ?>
		</p>
		<p><code><?php echo esc_html( home_url() ); ?></code></p>
	</div>
	<?php
}

/**
 * Inject the loader on every front-end page. wp_footer never fires in
 * wp-admin, so no explicit admin guard is needed. No-ops until the plugin is
 * fully configured and enabled.
 */
add_action(
	'wp_footer',
	function () {
		$settings = aicw_get_settings();
		if ( empty( $settings['enabled'] ) || empty( $settings['business_id'] ) || empty( $settings['embed_key'] ) || empty( $settings['host'] ) ) {
			return;
		}
		$src = untrailingslashit( $settings['host'] ) . '/b/' . rawurlencode( $settings['business_id'] ) . '/widget/embed.js';
		printf(
			'<script src="%s" data-key="%s" async></script>' . "\n",
			esc_url( $src ),
			esc_attr( $settings['embed_key'] )
		);
	}
);
