# Offer側 WebRTC統計データ仕様書

## 概要

Offer側は映像を受信し、人物検出推論を実行する側です。Answer側から送信される映像ストリームの品質分析と、ONNX推論エンジンの性能監視を行います。

## データ収集方式
- **収集間隔**: 1秒
- **保存場所**: メモリ内配列（最大1000エントリ）
- **出力形式**: CSV
- **ファイル名**: `offer_webrtc_stats_YYYY-MM-DD_HH-MM-SS.csv`

## 全統計項目一覧

### 1. システム基本情報

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `timestamp` | string | データ収集時刻（ISO 8601形式） | `2024-01-15T10:30:45.123Z` |
| `side` | string | データ収集側の識別子 | `offer` |
| `connection_state` | string | WebRTC接続の全体状態 | `connected`, `connecting`, `disconnected`, `failed`, `closed` |
| `ice_connection_state` | string | ICE接続の状態 | `connected`, `checking`, `completed`, `failed`, `disconnected`, `closed` |
| `ice_gathering_state` | string | ICE候補収集の状態 | `complete`, `gathering`, `new` |
| `signaling_state` | string | WebRTCシグナリングの状態 | `stable`, `have-local-offer`, `have-remote-offer`, `have-local-pranswer` |

### 2. 推論エンジン性能統計（Offer側固有）

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `inference_enabled` | boolean | 推論機能の有効/無効状態 | - | `true`, `false` |
| `total_inferences` | number | 累計推論実行回数 | 回 | `1234` |
| `skipped_frames_inference` | number | 推論がスキップされたフレーム数 | フレーム | `56` |
| `min_inference_interval_ms` | number | 最小推論間隔 | ミリ秒 | `166` |
| `detections_count` | number | 現在フレームでの全検出オブジェクト数 | 個 | `3` |
| `detections_person_count` | number | 現在フレームでの人物検出数 | 人 | `2` |
| `max_confidence` | number | 現在フレームでの最高検出信頼度 | 0.0-1.0 | `0.95` |
| `min_confidence` | number | 現在フレームでの最低検出信頼度 | 0.0-1.0 | `0.67` |
| `avg_confidence` | number | 現在フレームでの平均検出信頼度 | 0.0-1.0 | `0.82` |
| `person_max_area` | number | 現在フレームでの最大人物領域面積 | px² | `156800` |
| `person_min_area` | number | 現在フレームでの最小人物領域面積 | px² | `12450` |
| `person_avg_area` | number | 現在フレームでの平均人物領域面積 | px² | `84625` |

### 3. コーデック統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `codec_payload_type` | number | RTPペイロードタイプ番号 | `96`, `97`, `98` |
| `codec_mime_type` | string | コーデックのMIMEタイプ | `video/VP8`, `video/H264`, `audio/opus` |
| `codec_clock_rate` | number | コーデックのクロックレート | `90000` (映像), `48000` (音声) |
| `codec_channels` | number | チャンネル数（音声のみ） | `1`, `2` |
| `codec_sdp_fmtp_line` | string | SDP形式のパラメータ行 | `profile-level-id=42e01f` |

### 4. 受信RTPストリーム統計（映像品質監視）

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `inbound_packets_received` | number | 累計受信パケット数 | パケット | `45678` |
| `inbound_bytes_received` | number | 累計受信バイト数 | バイト | `12345678` |
| `inbound_packets_lost` | number | 累計損失パケット数 | パケット | `12` |
| `inbound_jitter` | number | パケット到着間隔のばらつき | 秒 | `0.003` |
| `inbound_frames_decoded` | number | 累計デコード済みフレーム数 | フレーム | `1520` |
| `inbound_key_frames_decoded` | number | 累計キーフレームデコード数 | フレーム | `48` |
| `inbound_frame_width` | number | 受信フレームの幅 | ピクセル | `1920` |
| `inbound_frame_height` | number | 受信フレームの高さ | ピクセル | `1080` |
| `inbound_frames_per_second` | number | 受信フレームレート | fps | `29.97` |
| `inbound_qp_sum` | number | 量子化パラメータの累計 | - | `23456` |
| `inbound_total_decode_time` | number | 累計デコード処理時間 | 秒 | `4.567` |
| `inbound_total_inter_frame_delay` | number | フレーム間遅延の累計 | 秒 | `0.987` |
| `inbound_audio_level` | number | 受信音声レベル | 0.0-1.0 | `0.65` |
| `inbound_total_audio_energy` | number | 累計音声エネルギー | - | `123.45` |
| `inbound_concealed_samples` | number | 隠蔽された音声サンプル数 | サンプル | `480` |

### 5. 送信RTPストリーム統計（データ送信品質）

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `outbound_packets_sent` | number | 累計送信パケット数 | パケット | `8765` |
| `outbound_bytes_sent` | number | 累計送信バイト数 | バイト | `987654` |
| `outbound_target_bitrate` | number | 目標ビットレート | bps | `2000000` |
| `outbound_frames_encoded` | number | 累計エンコード済みフレーム数 | フレーム | `890` |
| `outbound_key_frames_encoded` | number | 累計キーフレームエンコード数 | フレーム | `25` |
| `outbound_total_encode_time` | number | 累計エンコード処理時間 | 秒 | `2.345` |
| `outbound_total_packet_send_delay` | number | パケット送信遅延の累計 | 秒 | `0.234` |
| `outbound_quality_limitation_reason` | string | 品質制限の理由 | - | `bandwidth`, `cpu`, `none`, `other` |
| `outbound_quality_limitation_durations` | object | 品質制限継続時間の詳細 | - | `{"bandwidth":1.2,"cpu":0.8}` |
| `outbound_nack_count` | number | 送信NACK（再送要求）数 | 回 | `5` |
| `outbound_fir_count` | number | 送信FIR（フルイントラリクエスト）数 | 回 | `2` |
| `outbound_pli_count` | number | 送信PLI（ピクチャーロスインディケーション）数 | 回 | `1` |
| `outbound_encoder_implementation` | string | エンコーダー実装名 | - | `libvpx`, `ExternalEncoder` |

### 6. リモート側統計（Answer側の受信状況）

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `remote_inbound_packets_lost` | number | リモート側での損失パケット数 | パケット | `3` |
| `remote_inbound_jitter` | number | リモート側でのジッター | 秒 | `0.002` |
| `remote_inbound_round_trip_time` | number | 現在のRTT（往復時間） | 秒 | `0.045` |
| `remote_inbound_total_round_trip_time` | number | RTTの累計時間 | 秒 | `12.345` |
| `remote_inbound_fraction_lost` | number | リモート側での損失率 | 0.0-1.0 | `0.001` |

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `remote_outbound_packets_sent` | number | リモート側から送信されたパケット数 | パケット | `45670` |
| `remote_outbound_bytes_sent` | number | リモート側から送信されたバイト数 | バイト | `12345000` |
| `remote_outbound_remote_timestamp` | number | リモートタイムスタンプ | - | `1642243845123` |

### 7. メディアソース統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `media_source_track_identifier` | string | メディアトラックの識別子 | `{12345678-1234-5678-9abc-def012345678}` |
| `media_source_kind` | string | メディアの種類 | `video`, `audio` |
| `media_source_width` | number | ソース映像の幅（映像のみ） | `1920` |
| `media_source_height` | number | ソース映像の高さ（映像のみ） | `1080` |
| `media_source_frames` | number | ソースフレーム総数 | `1523` |
| `media_source_frames_per_second` | number | ソースフレームレート | `30.0` |
| `media_source_audio_level` | number | ソース音声レベル（音声のみ） | `0.75` |
| `media_source_total_audio_energy` | number | 累計音声エネルギー（音声のみ） | `156.78` |

### 8. CSRC統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `csrc_contributor_ssrc` | number | コントリビューターSSRC | `1234567890` |
| `csrc_inbound_rtp_stream_id` | string | 関連するRTPストリームID | `RTCInboundRTPVideoStream_1234567890` |

### 9. ピア接続統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `peer_connection_data_channels_opened` | number | 開いたデータチャンネル数 | 個 | `1` |
| `peer_connection_data_channels_closed` | number | 閉じたデータチャンネル数 | 個 | `0` |

### 10. データチャンネル統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `data_channel_label` | string | データチャンネルのラベル | - | `chat` |
| `data_channel_protocol` | string | 使用プロトコル | - | `sctp` |
| `data_channel_identifier` | number | データチャンネル識別子 | - | `0` |
| `data_channel_state` | string | データチャンネルの状態 | - | `open`, `connecting`, `closing`, `closed` |
| `data_channel_messages_sent` | number | 送信メッセージ数 | 個 | `123` |
| `data_channel_bytes_sent` | number | 送信バイト数 | バイト | `4567` |
| `data_channel_messages_received` | number | 受信メッセージ数 | 個 | `89` |
| `data_channel_bytes_received` | number | 受信バイト数 | バイト | `2345` |

### 11. ストリーム統計（非推奨）

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `stream_identifier` | string | ストリーム識別子 | `{87654321-4321-8765-cba9-876543210fed}` |
| `stream_track_ids` | array | 関連するトラックID配列 | `["track1", "track2"]` |

### 12. トラック統計（非推奨）

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `track_identifier` | string | トラック識別子 | `{13579246-1357-9246-8024-135792468024}` |
| `track_remote_source` | boolean | リモートソースかどうか | `true`, `false` |
| `track_ended` | boolean | トラックが終了しているか | `false`, `true` |

### 13. トランシーバー統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `transceiver_sender_id` | string | 送信者ID | `RTCRtpSender_12345` |
| `transceiver_receiver_id` | string | 受信者ID | `RTCRtpReceiver_67890` |
| `transceiver_media_id` | string | メディアID | `0` |

### 14. 送信者統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `sender_media_source_id` | string | メディアソースID | `RTCVideoSource_1` |
| `sender_track_id` | string | 送信トラックID | `{track-id-12345}` |

### 15. 受信者統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `receiver_track_id` | string | 受信トラックID | - | `{track-id-67890}` |
| `receiver_jitter_buffer_delay` | number | ジッターバッファ遅延 | 秒 | `0.05` |
| `receiver_jitter_buffer_emitted_count` | number | ジッターバッファ出力数 | 個 | `1520` |

### 16. トランスポート統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `transport_bytes_sent` | number | 送信バイト数 | バイト | `1234567` |
| `transport_bytes_received` | number | 受信バイト数 | バイト | `9876543` |
| `transport_dtls_state` | string | DTLS接続状態 | - | `connected`, `connecting`, `closed`, `failed` |
| `transport_selected_candidate_pair_id` | string | 選択された候補ペアID | - | `RTCIceCandidatePair_12345678` |
| `transport_local_certificate_id` | string | ローカル証明書ID | - | `RTCCertificate_local_12345` |
| `transport_remote_certificate_id` | string | リモート証明書ID | - | `RTCCertificate_remote_67890` |
| `transport_tls_version` | string | TLSバージョン | - | `TLS1.2`, `TLS1.3` |
| `transport_dtls_cipher` | string | DTLS暗号スイート | - | `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` |
| `transport_ice_role` | string | ICEロール | - | `controlling`, `controlled` |
| `transport_ice_local_username_fragment` | string | ICEローカルユーザー名フラグメント | - | `abcd1234` |
| `transport_ice_state` | string | ICE状態 | - | `connected`, `checking`, `completed` |

### 17. ICE候補ペア統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `candidate_pair_local_candidate_id` | string | ローカル候補ID | - | `RTCIceCandidate_local_12345` |
| `candidate_pair_remote_candidate_id` | string | リモート候補ID | - | `RTCIceCandidate_remote_67890` |
| `candidate_pair_state` | string | 候補ペアの状態 | - | `succeeded`, `in-progress`, `failed` |
| `candidate_pair_nominated` | boolean | ノミネート済みかどうか | - | `true`, `false` |
| `candidate_pair_bytes_sent` | number | 送信バイト数 | バイト | `123456` |
| `candidate_pair_bytes_received` | number | 受信バイト数 | バイト | `654321` |
| `candidate_pair_last_packet_sent_timestamp` | number | 最終パケット送信時刻 | ミリ秒 | `1642243845123` |
| `candidate_pair_last_packet_received_timestamp` | number | 最終パケット受信時刻 | ミリ秒 | `1642243845125` |
| `candidate_pair_total_round_trip_time` | number | 累計RTT | 秒 | `4.567` |
| `candidate_pair_current_round_trip_time` | number | 現在のRTT | 秒 | `0.045` |
| `candidate_pair_available_outgoing_bitrate` | number | 利用可能送信ビットレート | bps | `2500000` |
| `candidate_pair_requests_received` | number | 受信リクエスト数 | 個 | `25` |
| `candidate_pair_requests_sent` | number | 送信リクエスト数 | 個 | `24` |
| `candidate_pair_responses_received` | number | 受信レスポンス数 | 個 | `24` |
| `candidate_pair_responses_sent` | number | 送信レスポンス数 | 個 | `25` |
| `candidate_pair_consent_requests_sent` | number | 同意リクエスト送信数 | 個 | `12` |

### 18. ローカル・リモート候補統計

#### ローカル候補
| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `local_candidate_transport_id` | string | トランスポートID | `RTCTransport_0_1` |
| `local_candidate_address` | string | ローカルIPアドレス | `192.168.1.100` |
| `local_candidate_port` | number | ローカルポート番号 | `51234` |
| `local_candidate_protocol` | string | 通信プロトコル | `udp`, `tcp` |
| `local_candidate_type` | string | 候補タイプ | `host`, `srflx`, `prflx`, `relay` |
| `local_candidate_priority` | number | 候補の優先度 | `2130706431` |
| `local_candidate_url` | string | STUNサーバーURL（該当する場合） | `stun:stun.example.com:3478` |

#### リモート候補
| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `remote_candidate_transport_id` | string | トランスポートID | `RTCTransport_0_1` |
| `remote_candidate_address` | string | リモートIPアドレス | `10.0.0.35` |
| `remote_candidate_port` | number | リモートポート番号 | `48192` |
| `remote_candidate_protocol` | string | 通信プロトコル | `udp`, `tcp` |
| `remote_candidate_type` | string | 候補タイプ | `host`, `srflx`, `prflx`, `relay` |
| `remote_candidate_priority` | number | 候補の優先度 | `2130706175` |
| `remote_candidate_url` | string | STUNサーバーURL（該当する場合） | `stun:10.100.0.35:3478` |

### 19. 証明書統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `certificate_fingerprint` | string | 証明書フィンガープリント | `A1:B2:C3:D4:E5:F6:...` |
| `certificate_fingerprint_algorithm` | string | フィンガープリントアルゴリズム | `sha-256`, `sha-1` |
| `certificate_base64_certificate` | string | Base64エンコードされた証明書 | `MIICXjCCAcegAwIBAgI...` |

### 20. レポート概要統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `report_types_count` | number | 収集されたレポートタイプ数 | 個 | `12` |
| `report_types` | string | 収集されたレポートタイプのリスト | - | `codec\|inbound-rtp\|outbound-rtp\|transport` |
| `total_reports` | number | 総レポート数 | 個 | `45` |

## 使用方法

### 1. データ収集の開始
1. WebRTC接続を確立（Answer側からカメラストリーム受信）
2. 自動的に1秒間隔で統計収集開始

### 2. 推論機能の有効化
1. 映像受信開始後、推論ラジオボタンで「ON」を選択
2. 推論関連統計項目が有効値で記録開始

### 3. CSV出力
1. 「遅延ログ保存」ボタンをクリック
2. ファイルが自動ダウンロード開始

### 4. データ分析のポイント

#### 接続品質評価
- `connection_state` が `connected` 以外の場合は接続不安定
- `candidate_pair_current_round_trip_time` でネットワーク遅延監視
- `inbound_packets_lost` / `inbound_packets_received` でパケット損失率計算

#### 映像品質評価
- `inbound_frames_per_second` で実際の受信FPS監視
- `inbound_frame_width` × `inbound_frame_height` で解像度確認
- `outbound_quality_limitation_reason` で品質制限要因特定

#### 推論性能評価
- `total_inferences` / 稼働時間 で推論実行頻度算出
- `detections_person_count` で人物検出精度監視
- `avg_confidence` で検出信頼度品質確認

## 注意事項

1. **ブラウザ依存**: Chrome、Edge推奨。統計項目の可用性はブラウザにより異なります
2. **接続要件**: 統計収集にはWebRTC接続が必須
3. **メモリ制限**: 最大1000エントリまで保持（約16分間）
4. **推論統計**: 推論機能有効時のみ意味のある値が記録されます
5. **データ欠損**: ネットワーク状況により一部統計項目が取得できない場合があります

---
**最終更新**: 2024年1月
**対象バージョン**: HumanDetectionSystem v1.0