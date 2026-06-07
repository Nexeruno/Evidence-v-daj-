"""
FÁZE 5.0A: External Python ML Runtime Server
First real external Python entrypoint (not Node.js baseline)

This server accepts ML pipeline requests from Node/Firebase layer
and processes them with Python, returning structured results.
"""

from flask import Flask, request, jsonify
from datetime import datetime
import logging
import json
from typing import Dict, List, Any, Tuple

# Configuration
app = Flask(__name__)
PORT = 5000
DEBUG = True

# Logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# 🔒 CONTRACT VALIDATION - Request/Response Shape Validation
# ═══════════════════════════════════════════════════════════════════════════════

class RequestContract:
    """Validates incoming request shape with detailed validation"""

    REQUIRED_FIELDS = {
        'uid': str,
        'pipelineLevel': str,
        'modelVersion': str,
    }

    OPTIONAL_FIELDS = {
        'transactions': list,
        'income': (int, float),
        'debugMode': bool,
    }

    # Valid pipeline levels
    VALID_PIPELINE_LEVELS = ['L1', 'L2', 'L3']

    @staticmethod
    def validate_semantic_version(version: str) -> bool:
        """Check if version is semantic version format (e.g., 1.0.0 or 1.0)"""
        if not isinstance(version, str):
            return False
        parts = version.split('.')
        return len(parts) >= 2 and all(part.isdigit() for part in parts)

    @staticmethod
    def validate_transaction(tx: Dict, index: int) -> Tuple[bool, str]:
        """Validate individual transaction structure"""
        if not isinstance(tx, dict):
            return False, f"Transaction {index}: must be an object, got {type(tx).__name__}"

        # Check required fields
        if 'category' not in tx:
            return False, f"Transaction {index}: missing 'category' field"
        if 'amount' not in tx:
            return False, f"Transaction {index}: missing 'amount' field"
        if 'date' not in tx:
            return False, f"Transaction {index}: missing 'date' field"

        # Validate types
        if not isinstance(tx.get('category'), str):
            return False, f"Transaction {index}: 'category' must be string, got {type(tx.get('category')).__name__}"
        if not isinstance(tx.get('amount'), (int, float)):
            return False, f"Transaction {index}: 'amount' must be number, got {type(tx.get('amount')).__name__}"
        if not isinstance(tx.get('date'), str):
            return False, f"Transaction {index}: 'date' must be string, got {type(tx.get('date')).__name__}"

        # Validate values
        if not tx.get('category').strip():
            return False, f"Transaction {index}: 'category' cannot be empty"
        if tx.get('amount') < 0:
            return False, f"Transaction {index}: 'amount' must be >= 0, got {tx.get('amount')}"

        return True, ""

    @staticmethod
    def validate(data: Dict) -> Tuple[bool, str]:
        """
        Validate request shape with detailed error messages
        Returns: (is_valid, error_message)
        """
        if not isinstance(data, dict):
            return False, f"Request must be JSON object, got {type(data).__name__}"

        # Check required fields
        for field, expected_type in RequestContract.REQUIRED_FIELDS.items():
            if field not in data:
                return False, f"Missing required field: {field}"
            if not isinstance(data[field], expected_type):
                return False, f"Field '{field}' must be {expected_type.__name__}, got {type(data[field]).__name__}"

        # Validate uid (non-empty string)
        uid = data.get('uid', '').strip()
        if not uid:
            return False, "Field 'uid' cannot be empty"
        if len(uid) > 256:
            return False, f"Field 'uid' exceeds maximum length (256 chars)"

        # Validate pipelineLevel (must be L1, L2, or L3)
        pipeline_level = data.get('pipelineLevel', '').upper()
        if pipeline_level not in RequestContract.VALID_PIPELINE_LEVELS:
            return False, f"Field 'pipelineLevel' must be one of {RequestContract.VALID_PIPELINE_LEVELS}, got '{data.get('pipelineLevel')}'"

        # Validate modelVersion (semantic version)
        model_version = data.get('modelVersion', '')
        if not RequestContract.validate_semantic_version(model_version):
            return False, f"Field 'modelVersion' must be semantic version (e.g., 1.0 or 1.0.0), got '{model_version}'"

        # Check optional fields if present
        for field, expected_type in RequestContract.OPTIONAL_FIELDS.items():
            if field in data:
                value = data[field]
                if not isinstance(value, expected_type):
                    type_name = ' or '.join(t.__name__ for t in expected_type) if isinstance(expected_type, tuple) else expected_type.__name__
                    return False, f"Field '{field}' must be {type_name}, got {type(value).__name__}"

        # Validate transactions array if present
        if 'transactions' in data:
            transactions = data.get('transactions', [])
            if not isinstance(transactions, list):
                return False, f"Field 'transactions' must be array, got {type(transactions).__name__}"

            if len(transactions) > 10000:
                return False, f"Field 'transactions' exceeds maximum count (10000 items)"

            for idx, tx in enumerate(transactions):
                is_valid, error_msg = RequestContract.validate_transaction(tx, idx)
                if not is_valid:
                    return False, error_msg

        # Validate income if present
        if 'income' in data:
            income = data.get('income')
            if income < 0:
                return False, f"Field 'income' must be >= 0, got {income}"
            if income > 1000000000:  # 1 billion limit
                return False, f"Field 'income' exceeds maximum value (1,000,000,000)"

        return True, ""


# ═══════════════════════════════════════════════════════════════════════════════
# 📥 REQUEST PARSING - Input Parsing & Normalization
# ═══════════════════════════════════════════════════════════════════════════════

class RequestParser:
    """Parses and normalizes incoming request data"""

    @staticmethod
    def parse_transaction(tx: Dict) -> Dict:
        """Parse and normalize transaction data"""
        return {
            'category': str(tx.get('category', '')).strip().lower(),
            'amount': float(tx.get('amount', 0)),
            'date': str(tx.get('date', '')).strip(),
        }

    @staticmethod
    def parse(data: Dict) -> Dict:
        """
        Parse request data and return normalized form

        Returns normalized request with:
        - uid: trimmed, as-is
        - pipelineLevel: normalized to uppercase (L1, L2, L3)
        - modelVersion: as-is
        - transactions: parsed array of normalized transactions
        - income: float (default 0)
        - debugMode: boolean (default False)
        """
        # Validate first
        is_valid, error_msg = RequestContract.validate(data)
        if not is_valid:
            raise ValueError(error_msg)

        # Parse and normalize
        parsed = {
            'uid': str(data.get('uid', '')).strip(),
            'pipelineLevel': str(data.get('pipelineLevel', '')).upper(),
            'modelVersion': str(data.get('modelVersion', '')),
            'transactions': [
                RequestParser.parse_transaction(tx)
                for tx in data.get('transactions', [])
            ],
            'income': float(data.get('income', 0)),
            'debugMode': bool(data.get('debugMode', False)),
            # Metadata
            '_originalData': data,  # Keep original for debugging
        }

        return parsed

    @staticmethod
    def get_summary(parsed_data: Dict) -> Dict:
        """Get summary of parsed request for logging"""
        return {
            'uid': parsed_data['uid'],
            'pipelineLevel': parsed_data['pipelineLevel'],
            'modelVersion': parsed_data['modelVersion'],
            'transactionCount': len(parsed_data['transactions']),
            'income': parsed_data['income'],
            'debugMode': parsed_data['debugMode'],
        }


class ResponseContract:
    """Validates outgoing response shape"""

    @staticmethod
    def build(request_data: Dict, predictions: List[Dict], error: str = None) -> Dict:
        """
        Build response following contract shape
        """
        status = 'failed' if error else 'success'

        response = {
            'status': status,
            'uid': request_data.get('uid'),
            'pipelineLevel': request_data.get('pipelineLevel'),
            'modelVersion': request_data.get('modelVersion'),
            'processedAt': datetime.utcnow().isoformat() + 'Z',
            'predictions': predictions if not error else [],
            'error': error,
            'debugMetadata': {
                'processingTimeMs': 0,  # Will be set by caller
                'pythonRuntime': '3.9',
                'frameworkVersion': 'Flask/1.1.2'
            }
        }

        return response


# ═══════════════════════════════════════════════════════════════════════════════
# 🧮 ML BASELINE LOGIC - Simple deterministic predictions
# ═══════════════════════════════════════════════════════════════════════════════

def calculate_baseline_prediction(
    transactions: List[Dict],
    income: float,
    pipeline_level: str
) -> Dict:
    """
    Calculate simple baseline prediction from transactions
    FÁZE 5.0A: First placeholder logic (no ML model yet)

    Real model training will come in 5.0B+
    """

    if not transactions or income <= 0:
        return {
            'period': datetime.utcnow().strftime('%Y-%m'),
            'totalPredictedExpense': 0,
            'confidence': 0.0,
            'categories': {},
            'dataPoints': 0
        }

    # Group transactions by category
    category_totals = {}
    for tx in transactions:
        category = tx.get('category', 'other')
        amount = float(tx.get('amount', 0))
        if category not in category_totals:
            category_totals[category] = 0
        category_totals[category] += amount

    # Calculate averages (baseline)
    total_expense = sum(category_totals.values())
    num_transactions = len(transactions)

    # Simple confidence based on data quality
    # More transactions = higher confidence
    confidence = min(0.95, 0.5 + (num_transactions * 0.01))

    prediction = {
        'period': datetime.utcnow().strftime('%Y-%m'),
        'totalPredictedExpense': round(total_expense, 2),
        'confidence': round(confidence, 2),
        'categories': {k: round(v, 2) for k, v in category_totals.items()},
        'dataPoints': num_transactions,
        'pipelineLevel': pipeline_level
    }

    return prediction


# ═══════════════════════════════════════════════════════════════════════════════
# 🌐 HTTP ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    Used by Node/Firebase layer to verify Python runtime is available
    """
    logger.info('Health check requested')
    return jsonify({
        'status': 'healthy',
        'service': 'ml-runtime',
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'version': '5.0.0'
    }), 200


@app.route('/predict', methods=['POST'])
def predict():
    """
    FÁZE 5.0B: Main ML prediction endpoint with input parsing & validation
    Receives request from Node/Firebase, parses, validates, processes, returns predictions

    Request Contract:
    {
        "uid": "user-123",
        "pipelineLevel": "L1",
        "modelVersion": "1.0",
        "transactions": [
            {"category": "food", "amount": 50.00, "date": "2026-06-01"},
            {"category": "transport", "amount": 25.00, "date": "2026-06-02"}
        ],
        "income": 5000.00,
        "debugMode": false
    }

    Response Contract:
    {
        "status": "success",
        "uid": "user-123",
        "pipelineLevel": "L1",
        "modelVersion": "1.0",
        "processedAt": "2026-06-07T15:30:00.000Z",
        "predictions": [
            {
                "period": "2026-06",
                "totalPredictedExpense": 3500.00,
                "confidence": 0.87,
                "categories": {...},
                "dataPoints": 45,
                "pipelineLevel": "L1"
            }
        ],
        "error": null,
        "debugMetadata": {
            "processingTimeMs": 125,
            "pythonRuntime": "3.9",
            "frameworkVersion": "Flask/2.3.2",
            "parsed": {
                "uid": "user-123",
                "pipelineLevel": "L1",
                "transactionCount": 2,
                "income": 5000.00
            }
        }
    }
    """

    import time
    start_time = time.time()
    data = None

    try:
        # Step 1: Get and validate JSON format
        data = request.get_json()

        if data is None:
            logger.error('Request missing Content-Type: application/json')
            return jsonify({
                'status': 'failed',
                'error': 'Request must be JSON (Content-Type: application/json)',
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        if not data:
            logger.error('Empty JSON body')
            return jsonify({
                'status': 'failed',
                'error': 'Request body cannot be empty',
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Step 2: Validate request contract (detailed validation)
        is_valid, error_msg = RequestContract.validate(data)
        if not is_valid:
            logger.warning(f'Request validation failed: {error_msg}', extra={'uid': data.get('uid')})
            return jsonify({
                'status': 'failed',
                'error': error_msg,
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Step 3: Parse and normalize input
        try:
            parsed = RequestParser.parse(data)
            logger.debug(f"Request parsed successfully: {RequestParser.get_summary(parsed)}")
        except ValueError as parse_err:
            logger.error(f'Request parsing failed: {str(parse_err)}')
            return jsonify({
                'status': 'failed',
                'error': f'Input parsing error: {str(parse_err)}',
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        logger.info(f"[PREDICT] Processing: uid={parsed['uid']}, level={parsed['pipelineLevel']}, txns={len(parsed['transactions'])}")

        # Extract parsed data
        uid = parsed['uid']
        pipeline_level = parsed['pipelineLevel']
        model_version = parsed['modelVersion']
        transactions = parsed['transactions']
        income = parsed['income']
        debug_mode = parsed['debugMode']

        # Step 4: Generate prediction (using parsed data)
        prediction = calculate_baseline_prediction(transactions, income, pipeline_level)

        # Build response following contract
        response = ResponseContract.build(data, [prediction])

        # Add processing time and parsing metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        response['debugMetadata']['processingTimeMs'] = processing_time_ms
        response['debugMetadata']['parsed'] = RequestParser.get_summary(parsed)

        logger.info(f"[SUCCESS] Prediction completed: uid={uid}, level={pipeline_level}, confidence={prediction['confidence']}, time={processing_time_ms}ms")

        return jsonify(response), 200

    except Exception as e:
        logger.error(f'[ERROR] Prediction error: {str(e)}', extra={'uid': data.get('uid') if data else None})
        processing_time_ms = int((time.time() - start_time) * 1000)

        return jsonify({
            'status': 'failed',
            'error': str(e),
            'uid': data.get('uid') if data else None,
            'debugMetadata': {'processingTimeMs': processing_time_ms}
        }), 500


@app.route('/status', methods=['GET'])
def runtime_status():
    """
    Runtime status endpoint
    Returns Python runtime status and capabilities
    """
    logger.info('Status check requested')
    return jsonify({
        'status': 'active',
        'pythonVersion': '3.9',
        'framework': 'Flask',
        'endpoints': [
            '/health',
            '/status',
            '/predict'
        ],
        'capabilities': [
            'baseline-prediction'
        ],
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }), 200


# ═══════════════════════════════════════════════════════════════════════════════
# 🚀 ERROR HANDLERS
# ═══════════════════════════════════════════════════════════════════════════════

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    logger.error(f'Endpoint not found: {request.path}')
    return jsonify({
        'status': 'error',
        'error': f'Endpoint not found: {request.path}',
        'debugMetadata': {}
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f'Internal server error: {str(error)}')
    return jsonify({
        'status': 'error',
        'error': 'Internal server error',
        'debugMetadata': {}
    }), 500


# ═══════════════════════════════════════════════════════════════════════════════
# 🏃 ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    logger.info(f'Starting ML Runtime Server on port {PORT}')
    logger.info('Available endpoints:')
    logger.info('  GET  /health     - Health check')
    logger.info('  GET  /status     - Runtime status')
    logger.info('  POST /predict    - ML prediction')

    app.run(
        host='127.0.0.1',
        port=PORT,
        debug=DEBUG,
        threaded=True
    )
