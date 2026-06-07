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


# ═══════════════════════════════════════════════════════════════════════════════
# 🎯 FEATURE EXTRACTION - Real Dataset Row Processing (FÁZE 5.2B)
# ═══════════════════════════════════════════════════════════════════════════════

class DatasetErrorHandler:
    """
    FÁZE 5.2F: Handle dataset-specific errors for debugging and reporting
    Provides readable error messages for missing features, invalid state, etc.
    """

    ERROR_TYPES = {
        'MISSING_REQUIRED_FEATURE': {
            'http_code': 400,
            'message': 'Missing required feature in dataset'
        },
        'INVALID_TARGET_STATE': {
            'http_code': 400,
            'message': 'Invalid or missing target data for training'
        },
        'INCONSISTENT_DATASET_ROW': {
            'http_code': 400,
            'message': 'Inconsistent or malformed row in dataset'
        },
        'DATASET_TOO_SMALL': {
            'http_code': 400,
            'message': 'Dataset too small for meaningful prediction'
        },
        'FEATURE_VALUE_ERROR': {
            'http_code': 400,
            'message': 'Invalid feature value'
        }
    }

    @staticmethod
    def validate_required_features(transactions: List[Dict]) -> Tuple[bool, str, str]:
        """
        Validate that all required features are present in dataset
        Returns: (is_valid, error_message, error_type)
        """
        required_features = ['category', 'amount', 'date']

        if not transactions:
            return False, "Dataset cannot be empty", "DATASET_TOO_SMALL"

        for idx, tx in enumerate(transactions):
            for feature in required_features:
                if feature not in tx or not tx.get(feature):
                    return False, f"Row {idx}: Missing required feature '{feature}'", "MISSING_REQUIRED_FEATURE"

        return True, "", ""

    @staticmethod
    def validate_target_state(transactions: List[Dict]) -> Tuple[bool, str, str]:
        """
        Validate that target state is consistent and valid
        Target = monthly expense totals (aggregated from transaction dates)
        """
        if not transactions:
            return False, "Cannot determine target state: no transactions", "INVALID_TARGET_STATE"

        # Check if we can extract targets (need valid dates)
        monthly_targets = {}
        invalid_dates = 0

        for tx in transactions:
            date_str = str(tx.get('date', '')).strip()

            if date_str and len(date_str) >= 7:  # YYYY-MM format
                month_key = date_str[:7]
                if month_key not in monthly_targets:
                    monthly_targets[month_key] = 0
                monthly_targets[month_key] += float(tx.get('amount', 0))
            else:
                invalid_dates += 1

        if not monthly_targets:
            return False, "Cannot extract targets: no valid dates in YYYY-MM format", "INVALID_TARGET_STATE"

        if invalid_dates > len(transactions) * 0.5:
            return False, f"Too many invalid dates ({invalid_dates}/{len(transactions)})", "INVALID_TARGET_STATE"

        return True, "", ""

    @staticmethod
    def validate_row_consistency(transactions: List[Dict]) -> Tuple[bool, str, str]:
        """
        Validate that dataset rows are consistent and well-formed
        """
        for idx, tx in enumerate(transactions):
            if not isinstance(tx, dict):
                return False, f"Row {idx}: Transaction must be object, got {type(tx).__name__}", "INCONSISTENT_DATASET_ROW"

            # Check types
            category = tx.get('category')
            amount = tx.get('amount')
            date_str = tx.get('date')

            if category and not isinstance(category, str):
                return False, f"Row {idx}: 'category' must be string, got {type(category).__name__}", "FEATURE_VALUE_ERROR"

            if amount is not None and not isinstance(amount, (int, float)):
                return False, f"Row {idx}: 'amount' must be numeric, got {type(amount).__name__}", "FEATURE_VALUE_ERROR"

            if amount and amount < 0:
                return False, f"Row {idx}: 'amount' cannot be negative ({amount})", "FEATURE_VALUE_ERROR"

            if date_str and not isinstance(date_str, str):
                return False, f"Row {idx}: 'date' must be string, got {type(date_str).__name__}", "FEATURE_VALUE_ERROR"

            # Check for empty category
            if isinstance(category, str) and not category.strip():
                return False, f"Row {idx}: 'category' cannot be empty", "INCONSISTENT_DATASET_ROW"

        return True, "", ""


class FeatureExtractor:
    """
    FÁZE 5.2B: Extract and validate features from real dataset rows
    Handles feature values, target presence info, and training metadata
    """

    @staticmethod
    def extract_features(transaction: Dict) -> Dict:
        """Extract features from single transaction row"""
        return {
            'category': str(transaction.get('category', '')).strip().lower(),
            'amount': float(transaction.get('amount', 0)),
            'date': str(transaction.get('date', '')).strip(),
            'amount_numeric': float(transaction.get('amount', 0)) > 0,
        }

    @staticmethod
    def validate_features(transactions: List[Dict]) -> Tuple[bool, str]:
        """
        Validate that features are present and valid
        Returns: (is_valid, error_message)
        """
        if not transactions:
            return True, ""  # Empty is valid, just means no data

        for idx, tx in enumerate(transactions):
            if not isinstance(tx, dict):
                return False, f"Row {idx}: Transaction must be object, got {type(tx).__name__}"

            # Check feature fields exist
            if 'category' not in tx:
                return False, f"Row {idx}: Missing feature 'category'"
            if 'amount' not in tx:
                return False, f"Row {idx}: Missing feature 'amount'"
            if 'date' not in tx:
                return False, f"Row {idx}: Missing feature 'date'"

            # Validate feature types
            if not isinstance(tx.get('category'), str) or not tx.get('category').strip():
                return False, f"Row {idx}: Feature 'category' must be non-empty string"
            if not isinstance(tx.get('amount'), (int, float)):
                return False, f"Row {idx}: Feature 'amount' must be numeric"
            if tx.get('amount') < 0:
                return False, f"Row {idx}: Feature 'amount' cannot be negative"
            if not isinstance(tx.get('date'), str) or not tx.get('date').strip():
                return False, f"Row {idx}: Feature 'date' must be non-empty string"

        return True, ""

    @staticmethod
    def analyze_feature_coverage(transactions: List[Dict]) -> Dict:
        """Analyze what features are present and their quality"""
        if not transactions:
            return {
                'totalRows': 0,
                'featurePresence': {
                    'category': 0,
                    'amount': 0,
                    'date': 0,
                },
                'uniqueCategories': 0,
                'amountRange': None,
            }

        categories_present = sum(1 for t in transactions if 'category' in t and t.get('category', '').strip())
        amounts_present = sum(1 for t in transactions if 'amount' in t)
        dates_present = sum(1 for t in transactions if 'date' in t and t.get('date', '').strip())

        unique_categories = len(set(str(t.get('category', '')).strip().lower() for t in transactions if t.get('category', '').strip()))

        amounts = [float(t.get('amount', 0)) for t in transactions if isinstance(t.get('amount'), (int, float)) and t.get('amount') >= 0]
        amount_range = None
        if amounts:
            amount_range = {'min': round(min(amounts), 2), 'max': round(max(amounts), 2)}

        return {
            'totalRows': len(transactions),
            'featurePresence': {
                'category': round(categories_present / len(transactions) * 100, 1),
                'amount': round(amounts_present / len(transactions) * 100, 1),
                'date': round(dates_present / len(transactions) * 100, 1),
            },
            'uniqueCategories': unique_categories,
            'amountRange': amount_range,
        }


class TargetInfo:
    """
    FÁZE 5.2B: Detect and validate target presence for training
    Target = what we're trying to predict (monthly expenses)
    """

    @staticmethod
    def extract_targets(transactions: List[Dict]) -> Dict:
        """Extract target values (monthly aggregated expenses) from transactions"""
        if not transactions:
            return {}

        monthly_totals = {}
        for tx in transactions:
            date_str = str(tx.get('date', '')).strip()
            amount = float(tx.get('amount', 0))

            if date_str and len(date_str) >= 7:  # YYYY-MM format
                month_key = date_str[:7]
                if month_key not in monthly_totals:
                    monthly_totals[month_key] = 0
                monthly_totals[month_key] += amount

        return monthly_totals

    @staticmethod
    def validate_target_presence(transactions: List[Dict], income: float = None) -> Tuple[bool, str]:
        """
        Validate that we have target information
        For expense prediction, target = monthly expense totals
        Returns: (is_valid, error_message)
        """
        if not transactions:
            return False, "Cannot validate target: no transactions provided"

        # Check if we can extract monthly targets
        targets = TargetInfo.extract_targets(transactions)

        if not targets:
            return False, "Cannot extract target values: transactions must have valid dates in YYYY-MM format"

        if len(targets) < 1:
            return False, "Cannot validate target: insufficient monthly data (need at least 1 month)"

        return True, ""

    @staticmethod
    def analyze_target_quality(transactions: List[Dict]) -> Dict:
        """Analyze quality of target data for training"""
        targets = TargetInfo.extract_targets(transactions)

        if not targets:
            return {
                'targetPresence': False,
                'monthsAvailable': 0,
                'targetDataPoints': 0,
                'targetRange': None,
                'recommendation': 'Cannot perform training: no valid monthly targets found',
            }

        sorted_months = sorted(targets.keys())
        values = list(targets.values())

        return {
            'targetPresence': True,
            'monthsAvailable': len(sorted_months),
            'targetDataPoints': len(values),
            'targetRange': {
                'min': round(min(values), 2),
                'max': round(max(values), 2),
                'mean': round(sum(values) / len(values), 2),
            },
            'timeSpan': f"{sorted_months[0]} to {sorted_months[-1]}",
            'recommendation': 'Ready for training' if len(sorted_months) >= 3 else f'Limited data: {len(sorted_months)} months (recommend 3+)',
        }


class DatasetMetadata:
    """
    FÁZE 5.2B: Generate metadata about dataset for first use-case
    Tracks what data we have and whether it's suitable for training
    """

    @staticmethod
    def generate(transactions: List[Dict], income: float = None) -> Dict:
        """Generate comprehensive metadata about dataset"""
        feature_coverage = FeatureExtractor.analyze_feature_coverage(transactions)
        target_quality = TargetInfo.analyze_target_quality(transactions)

        total_expense = sum(float(t.get('amount', 0)) for t in transactions if isinstance(t.get('amount'), (int, float)))

        return {
            'datasetSize': {
                'totalRows': len(transactions),
                'featurePresence': feature_coverage['featurePresence'],
                'uniqueCategories': feature_coverage['uniqueCategories'],
            },
            'features': {
                'amountRange': feature_coverage['amountRange'],
                'categoriesPresent': feature_coverage['uniqueCategories'] > 0,
                'datesPresent': feature_coverage['featurePresence']['date'] > 0,
            },
            'targets': {
                'monthlyTargets': target_quality['targetPresence'],
                'monthsAvailable': target_quality['monthsAvailable'],
                'timeSpan': target_quality.get('timeSpan', 'N/A'),
                'targetRange': target_quality.get('targetRange'),
            },
            'income': {
                'provided': income is not None and income > 0,
                'amount': round(income, 2) if income and income > 0 else None,
            },
            'summary': {
                'totalExpense': round(total_expense, 2),
                'readyForTraining': target_quality['targetPresence'] and feature_coverage['featurePresence']['category'] >= 80,
                'recommendation': target_quality.get('recommendation', 'Unknown'),
            }
        }


class ResponseContract:
    """Builds and validates outgoing response shape"""

    @staticmethod
    def build(request_data: Dict, predictions: List[Dict], error: str = None) -> Dict:
        """
        Build response following contract shape
        FÁZE 5.1B: Added top-level 'result' field with confidence
        FÁZE 5.1C: Added input summary and confidence explanation in debugMetadata

        Response Contract Shape:
        {
            "status": "success" | "failed",
            "uid": "user-123",
            "pipelineLevel": "L1" | "L2" | "L3",
            "modelVersion": "1.0",
            "processedAt": "2026-06-07T15:30:00.000Z",
            "result": {
                "predictedExpense": 3500.00,
                "confidence": 0.87,
                "confidenceFactors": {
                    "dataFrequency": 0.5,
                    "transactionCount": 0.9,
                    "expenseRatio": 0.2,
                    "incomeConstraint": 1.0
                }
            },
            "predictions": [
                {
                    "period": "2026-06",
                    "totalPredictedExpense": 3500.00,
                    "confidence": 0.87,
                    "confidenceFactors": {...},
                    "categories": {"food": 1200.00, "transport": 800.00},
                    "dataPoints": 45,
                    "pipelineLevel": "L1"
                }
            ],
            "error": null | "error message",
            "debugMetadata": {
                "processingTimeMs": 125,
                "pythonRuntime": "3.9",
                "frameworkVersion": "Flask/2.3.2",
                "inputs": {
                    "transactions": 45,
                    "monthsOfHistory": 6,
                    "totalHistoricalExpense": 23500.00,
                    "income": 5000.00,
                    "expenseToIncomeRatio": "4.7x"
                },
                "confidenceExplained": {
                    "dataFrequency": "50% (6 months)",
                    "transactionCount": "90% (45 txns)",
                    "expenseRatio": "20% (4.7x income)",
                    "incomeConstraint": "100% (provided)"
                },
                "calculationMethod": "weighted recent (60%) + overall (40%) average",
                "parsed": {...}
            }
        }
        """
        status = 'failed' if error else 'success'

        # Build result field from first prediction if success
        result = None
        if not error and predictions and len(predictions) > 0:
            first_pred = predictions[0]
            result = {
                'predictedExpense': first_pred.get('totalPredictedExpense', 0.0),
                'confidence': first_pred.get('confidence', 0.0),
                'confidenceFactors': first_pred.get('confidenceFactors', {})
            }

        response = {
            'status': status,
            'uid': request_data.get('uid'),
            'pipelineLevel': request_data.get('pipelineLevel'),
            'modelVersion': request_data.get('modelVersion'),
            'processedAt': datetime.utcnow().isoformat() + 'Z',
            'result': result,
            'predictions': predictions if not error else [],
            'error': error,
            'debugMetadata': {
                'processingTimeMs': 0,  # Will be set by caller
                'pythonRuntime': '3.9',
                'frameworkVersion': 'Flask/2.3.2'
            }
        }

        return response

    @staticmethod
    def validate(response: Dict) -> Tuple[bool, str]:
        """
        Validate response shape matches contract
        FÁZE 5.1B: Validates result field and confidenceFactors
        Returns: (is_valid, error_message)
        """
        # Check required top-level fields (including new 'result' field)
        required_fields = ['status', 'uid', 'pipelineLevel', 'modelVersion', 'processedAt', 'result', 'predictions', 'error', 'debugMetadata']
        for field in required_fields:
            if field not in response:
                return False, f"Response missing required field: {field}"

        # Validate status
        if response['status'] not in ['success', 'failed']:
            return False, f"Response 'status' must be 'success' or 'failed', got '{response['status']}'"

        # Validate result field (if success)
        if response['status'] == 'success':
            if response['result'] is None:
                return False, "Response 'result' must not be null for successful response"
            if not isinstance(response['result'], dict):
                return False, f"Response 'result' must be object, got {type(response['result']).__name__}"

            # Validate result fields
            result_required = ['predictedExpense', 'confidence', 'confidenceFactors']
            for field in result_required:
                if field not in response['result']:
                    return False, f"Result missing field: {field}"

            # Validate result types
            if not isinstance(response['result']['predictedExpense'], (int, float)):
                return False, "Result 'predictedExpense' must be number"
            if not isinstance(response['result']['confidence'], (int, float)):
                return False, "Result 'confidence' must be number"
            if not isinstance(response['result']['confidenceFactors'], dict):
                return False, "Result 'confidenceFactors' must be object"

            # Validate confidence factors
            factors_required = ['dataFrequency', 'transactionCount', 'expenseRatio', 'incomeConstraint']
            for factor in factors_required:
                if factor not in response['result']['confidenceFactors']:
                    return False, f"ConfidenceFactors missing: {factor}"
                if not isinstance(response['result']['confidenceFactors'][factor], (int, float)):
                    return False, f"ConfidenceFactors '{factor}' must be number"

        # Validate predictions array
        if not isinstance(response['predictions'], list):
            return False, f"Response 'predictions' must be array, got {type(response['predictions']).__name__}"

        # If success, predictions must be non-empty
        if response['status'] == 'success' and len(response['predictions']) == 0:
            return False, "Response 'predictions' must not be empty for successful response"

        # Validate each prediction
        for idx, pred in enumerate(response['predictions']):
            if not isinstance(pred, dict):
                return False, f"Prediction {idx} must be object, got {type(pred).__name__}"

            # Check required prediction fields
            pred_required = ['period', 'totalPredictedExpense', 'confidence', 'confidenceFactors', 'categories', 'dataPoints', 'pipelineLevel']
            for field in pred_required:
                if field not in pred:
                    return False, f"Prediction {idx} missing field: {field}"

            # Validate types
            if not isinstance(pred['period'], str):
                return False, f"Prediction {idx} 'period' must be string, got {type(pred['period']).__name__}"
            if not isinstance(pred['totalPredictedExpense'], (int, float)):
                return False, f"Prediction {idx} 'totalPredictedExpense' must be number"
            if not isinstance(pred['confidence'], (int, float)):
                return False, f"Prediction {idx} 'confidence' must be number"
            if not isinstance(pred['confidenceFactors'], dict):
                return False, f"Prediction {idx} 'confidenceFactors' must be object"
            if not isinstance(pred['categories'], dict):
                return False, f"Prediction {idx} 'categories' must be object"
            if not isinstance(pred['dataPoints'], int):
                return False, f"Prediction {idx} 'dataPoints' must be integer"

            # Validate value ranges
            if pred['totalPredictedExpense'] < 0:
                return False, f"Prediction {idx} 'totalPredictedExpense' must be >= 0"
            if not (0 <= pred['confidence'] <= 1):
                return False, f"Prediction {idx} 'confidence' must be between 0 and 1"
            if pred['dataPoints'] < 0:
                return False, f"Prediction {idx} 'dataPoints' must be >= 0"

        # Validate debugMetadata
        if not isinstance(response['debugMetadata'], dict):
            return False, "Response 'debugMetadata' must be object"
        if 'processingTimeMs' not in response['debugMetadata']:
            return False, "DebugMetadata must have 'processingTimeMs'"

        return True, ""


# ═══════════════════════════════════════════════════════════════════════════════
# 📈 EVALUATION METRICS - Offline evaluation for deterministic predictions (FÁZE 5.3A)
# ═══════════════════════════════════════════════════════════════════════════════

class EvaluationMetrics:
    """
    FÁZE 5.3A: Calculate evaluation metrics for predictions vs actual values
    """

    @staticmethod
    def calculate_mae(predictions: List[float], actuals: List[float]) -> float:
        """Mean Absolute Error"""
        if not predictions:
            return 0.0
        errors = [abs(p - a) for p, a in zip(predictions, actuals)]
        return sum(errors) / len(errors)

    @staticmethod
    def calculate_rmse(predictions: List[float], actuals: List[float]) -> float:
        """Root Mean Squared Error"""
        if not predictions:
            return 0.0
        squared_errors = [(p - a) ** 2 for p, a in zip(predictions, actuals)]
        mse = sum(squared_errors) / len(squared_errors)
        return mse ** 0.5

    @staticmethod
    def calculate_mape(predictions: List[float], actuals: List[float]) -> float:
        """Mean Absolute Percentage Error"""
        if not predictions or not actuals:
            return 0.0
        # Filter out zero actuals to avoid division by zero
        valid_pairs = [(p, a) for p, a in zip(predictions, actuals) if a > 0]
        if not valid_pairs:
            return 0.0
        percentage_errors = [abs((p - a) / a) * 100 for p, a in valid_pairs]
        return sum(percentage_errors) / len(percentage_errors)

    @staticmethod
    def calculate_r_squared(predictions: List[float], actuals: List[float]) -> float:
        """R-squared (coefficient of determination)"""
        if len(predictions) < 2:
            return 0.0

        mean_actual = sum(actuals) / len(actuals)
        ss_tot = sum((a - mean_actual) ** 2 for a in actuals)
        ss_res = sum((p - a) ** 2 for p, a in zip(predictions, actuals))

        if ss_tot == 0:
            return 0.0
        return 1 - (ss_res / ss_tot)


class DatasetSplitter:
    """
    FÁZE 5.3A: Split dataset into train/test for evaluation
    """

    @staticmethod
    def split_by_date(transactions: List[Dict], test_ratio: float = 0.2) -> Tuple[List[Dict], List[Dict], List[str]]:
        """
        Split by date: earlier transactions for train, later for test
        Returns: (train_transactions, test_transactions, test_months)
        """
        if not transactions:
            return [], [], []

        # Group by month
        monthly_groups = {}
        for tx in transactions:
            date_str = str(tx.get('date', '')).strip()
            if date_str and len(date_str) >= 7:
                month_key = date_str[:7]
                if month_key not in monthly_groups:
                    monthly_groups[month_key] = []
                monthly_groups[month_key].append(tx)

        sorted_months = sorted(monthly_groups.keys())
        split_idx = int(len(sorted_months) * (1 - test_ratio))

        train_months = sorted_months[:split_idx]
        test_months = sorted_months[split_idx:]

        train_txs = []
        test_txs = []

        for month in train_months:
            train_txs.extend(monthly_groups[month])
        for month in test_months:
            test_txs.extend(monthly_groups[month])

        return train_txs, test_txs, test_months

    @staticmethod
    def get_test_month_totals(transactions: List[Dict], test_months: List[str]) -> Dict[str, float]:
        """Get actual total expenses for test months"""
        monthly_totals = {}

        for month in test_months:
            monthly_totals[month] = 0.0

        for tx in transactions:
            date_str = str(tx.get('date', '')).strip()
            if date_str and len(date_str) >= 7:
                month_key = date_str[:7]
                if month_key in monthly_totals:
                    amount = float(tx.get('amount', 0))
                    monthly_totals[month_key] += amount

        return monthly_totals


class EvaluationReporter:
    """
    FÁZE 5.3A: Generate evaluation report with metrics
    """

    @staticmethod
    def generate_report(
        predictions: Dict[str, float],  # {month: predicted_expense}
        actuals: Dict[str, float],      # {month: actual_expense}
        metrics: Dict[str, float]        # {metric_name: value}
    ) -> Dict:
        """Generate structured evaluation report"""
        return {
            'predictions': predictions,
            'actuals': actuals,
            'metrics': {
                'mae': metrics.get('mae', 0),
                'rmse': metrics.get('rmse', 0),
                'mape': metrics.get('mape', 0),
                'r_squared': metrics.get('r_squared', 0),
            },
            'summary': {
                'test_months': len(predictions),
                'avg_prediction': sum(predictions.values()) / len(predictions) if predictions else 0,
                'avg_actual': sum(actuals.values()) / len(actuals) if actuals else 0,
                'prediction_bias': (sum(predictions.values()) - sum(actuals.values())) / len(predictions) if predictions else 0,
            }
        }


# ═══════════════════════════════════════════════════════════════════════════════
# 📊 FEATURE ANALYSIS - Real feature-based insights (FÁZE 5.2C)
# ═══════════════════════════════════════════════════════════════════════════════

class FeatureAnalyzer:
    """
    FÁZE 5.2C: Analyze real feature patterns to inform deterministic predictions
    Instead of generic placeholders, use actual feature data
    FÁZE 5.2D: Track which features were used, missing, and impactful
    """

    @staticmethod
    def analyze_category_distribution(transactions: List[Dict]) -> Dict:
        """Analyze category patterns in transactions"""
        if not transactions:
            return {}

        category_totals = {}
        category_counts = {}

        for tx in transactions:
            category = str(tx.get('category', 'other')).strip().lower()
            amount = float(tx.get('amount', 0))

            if category not in category_totals:
                category_totals[category] = 0
                category_counts[category] = 0
            category_totals[category] += amount
            category_counts[category] += 1

        # Calculate category statistics
        total_expense = sum(category_totals.values())
        distribution = {}

        for category in sorted(category_totals.keys()):
            amount = category_totals[category]
            count = category_counts[category]
            pct = (amount / total_expense * 100) if total_expense > 0 else 0

            distribution[category] = {
                'totalAmount': round(amount, 2),
                'transactionCount': count,
                'averageAmount': round(amount / count, 2) if count > 0 else 0,
                'percentOfTotal': round(pct, 1),
            }

        return distribution

    @staticmethod
    def analyze_amount_patterns(transactions: List[Dict]) -> Dict:
        """Analyze amount distribution patterns"""
        if not transactions:
            return {}

        amounts = [float(tx.get('amount', 0)) for tx in transactions if float(tx.get('amount', 0)) > 0]

        if not amounts:
            return {'count': 0}

        amounts_sorted = sorted(amounts)
        n = len(amounts_sorted)

        # Calculate statistics
        total = sum(amounts)
        mean = total / n
        median = amounts_sorted[n // 2] if n > 0 else 0
        min_amt = min(amounts)
        max_amt = max(amounts)

        # Calculate standard deviation
        variance = sum((x - mean) ** 2 for x in amounts) / n if n > 0 else 0
        std_dev = variance ** 0.5

        # Calculate percentiles
        p25_idx = int(n * 0.25)
        p75_idx = int(n * 0.75)
        p25 = amounts_sorted[p25_idx] if p25_idx < n else amounts_sorted[-1]
        p75 = amounts_sorted[p75_idx] if p75_idx < n else amounts_sorted[-1]

        return {
            'count': n,
            'total': round(total, 2),
            'mean': round(mean, 2),
            'median': round(median, 2),
            'min': round(min_amt, 2),
            'max': round(max_amt, 2),
            'stdDev': round(std_dev, 2),
            'p25': round(p25, 2),
            'p75': round(p75, 2),
            'range': f"{round(min_amt, 2)}–{round(max_amt, 2)}",
        }

    @staticmethod
    def analyze_temporal_pattern(transactions: List[Dict]) -> Dict:
        """Analyze temporal spending patterns"""
        if not transactions:
            return {}

        monthly_totals = {}
        daily_counts = {}

        for tx in transactions:
            date_str = str(tx.get('date', '')).strip()
            amount = float(tx.get('amount', 0))

            # Monthly aggregation
            if date_str and len(date_str) >= 7:
                month_key = date_str[:7]
                if month_key not in monthly_totals:
                    monthly_totals[month_key] = 0
                monthly_totals[month_key] += amount

            # Daily count (for frequency)
            if date_str:
                if date_str not in daily_counts:
                    daily_counts[date_str] = 0
                daily_counts[date_str] += 1

        if not monthly_totals:
            return {}

        sorted_months = sorted(monthly_totals.keys())
        values = list(monthly_totals.values())

        # Calculate temporal trend
        if len(sorted_months) >= 2:
            first_half_avg = sum(values[:len(values)//2]) / (len(values)//2)
            second_half_avg = sum(values[len(values)//2:]) / (len(values) - len(values)//2)
            trend = ((second_half_avg - first_half_avg) / first_half_avg * 100) if first_half_avg > 0 else 0
            trend_direction = 'increasing' if trend > 5 else ('decreasing' if trend < -5 else 'stable')
        else:
            trend_direction = 'insufficient'
            trend = 0

        return {
            'monthsAnalyzed': len(sorted_months),
            'timeSpan': f"{sorted_months[0]} to {sorted_months[-1]}",
            'monthlyAverage': round(sum(values) / len(values), 2),
            'monthlyMin': round(min(values), 2),
            'monthlyMax': round(max(values), 2),
            'trend': round(trend, 1),
            'trendDirection': trend_direction,
            'transactionDensity': round(len(transactions) / len(sorted_months), 1),
        }

    @staticmethod
    def calculate_feature_impact(
        transactions: List[Dict],
        category_distribution: Dict,
        amount_patterns: Dict
    ) -> Dict:
        """Calculate which features have most impact on total expenses"""
        total_expense = sum(t['totalAmount'] for t in category_distribution.values())

        if total_expense == 0:
            return {}

        # Find high-impact categories
        impacts = []
        for category, stats in category_distribution.items():
            impact_pct = stats['percentOfTotal']
            impacts.append({
                'category': category,
                'impact': impact_pct,
                'avgAmount': stats['averageAmount'],
                'frequency': stats['transactionCount'],
            })

        impacts_sorted = sorted(impacts, key=lambda x: x['impact'], reverse=True)

        # Identify patterns
        top_category = impacts_sorted[0] if impacts_sorted else None
        top_impact = top_category['impact'] if top_category else 0

        # Feature variance (diversity)
        num_categories = len(category_distribution)
        diversity = 'high' if num_categories > 5 else ('medium' if num_categories > 2 else 'low')

        return {
            'topImpactCategory': top_category['category'] if top_category else None,
            'topCategoryImpact': round(top_impact, 1),
            'topTransactions': impacts_sorted[:3],
            'categoryDiversity': diversity,
            'uniqueCategories': num_categories,
        }

    @staticmethod
    def track_feature_usage(transactions: List[Dict], income: float = None) -> Dict:
        """
        FÁZE 5.2D: Track which features were used vs missing
        Provides brief overview for debug metadata
        """
        # Expected standard features
        expected_features = ['category', 'amount', 'date']
        optional_features = ['income']

        # Check presence in transactions
        used_features = set()
        feature_completeness = {}

        for tx in transactions:
            for feature in expected_features:
                if feature in tx and tx.get(feature):
                    used_features.add(feature)

        # Calculate completeness percentage
        if transactions:
            for feature in expected_features:
                present = sum(1 for tx in transactions if feature in tx and tx.get(feature))
                completeness = round(present / len(transactions) * 100, 0)
                feature_completeness[feature] = int(completeness)

        # Identify missing features
        missing_features = []
        for feature in expected_features:
            if feature not in used_features:
                missing_features.append(feature)

        return {
            'usedFeatures': sorted(list(used_features)),
            'missingFeatures': missing_features,
            'featureCompleteness': feature_completeness,
            'incomeProvided': income is not None and income > 0,
            'summary': f"Used {len(used_features)}/3 features, {len(missing_features)} missing"
        }

    @staticmethod
    def identify_impact_drivers(
        category_distribution: Dict,
        amount_patterns: Dict,
        temporal_pattern: Dict
    ) -> Dict:
        """
        FÁZE 5.2D: Identify what most influenced the result
        Brief summary of key drivers
        """
        drivers = []

        # Category impact driver
        if category_distribution:
            impacts = sorted(
                [(cat, stats['percentOfTotal']) for cat, stats in category_distribution.items()],
                key=lambda x: x[1],
                reverse=True
            )
            if impacts:
                top_cat, top_pct = impacts[0]
                if top_pct > 40:
                    drivers.append(f"{top_cat.capitalize()} dominates ({top_pct:.0f}%)")

        # Volatility driver
        if amount_patterns and 'stdDev' in amount_patterns and 'mean' in amount_patterns:
            std_dev = amount_patterns['stdDev']
            mean = amount_patterns['mean']
            if mean > 0:
                cv = (std_dev / mean) * 100  # Coefficient of variation
                if cv > 50:
                    drivers.append(f"High volatility (CV {cv:.0f}%)")
                elif cv < 20:
                    drivers.append(f"Consistent amounts (CV {cv:.0f}%)")

        # Temporal driver
        if temporal_pattern and 'trendDirection' in temporal_pattern:
            trend = temporal_pattern.get('trend', 0)
            if abs(trend) > 10:
                direction = "increasing" if trend > 0 else "decreasing"
                drivers.append(f"Spending {direction} ({trend:.1f}%)")

        return {
            'topDrivers': drivers[:3],  # Top 3 drivers
            'driverCount': len(drivers),
            'summary': ' | '.join(drivers) if drivers else 'Balanced spending pattern'
        }


# ═══════════════════════════════════════════════════════════════════════════════
# 🧮 ML BASELINE LOGIC - Simple deterministic predictions
# ═══════════════════════════════════════════════════════════════════════════════

def calculate_baseline_prediction(
    transactions: List[Dict],
    income: float,
    pipeline_level: str
) -> Dict:
    """
    Calculate deterministic baseline prediction from transactions
    FÁZE 5.0C: Improved deterministic logic (no ML model yet)

    Uses historical transaction data to estimate future expenses.
    Formula: (recent_avg * 0.6) + (overall_avg * 0.4) weighted by data quality

    Real model training will come in FÁZE 5.1+
    """

    now = datetime.utcnow()
    current_period = now.strftime('%Y-%m')

    # Handle empty data
    if not transactions:
        return {
            'period': current_period,
            'totalPredictedExpense': 0.0,
            'confidence': 0.0,
            'categories': {},
            'dataPoints': 0,
            'pipelineLevel': pipeline_level,
            'confidenceFactors': {
                'dataFrequency': 0.0,
                'transactionCount': 0.0,
                'expenseRatio': 0.0,
                'incomeConstraint': 0.0
            },
            '_debug': {
                'inputSummary': {
                    'transactions': 0,
                    'monthsOfHistory': 0,
                    'totalHistoricalExpense': 0.0,
                    'income': round(income, 2) if income > 0 else None,
                    'expenseToIncomeRatio': 'N/A'
                },
                'confidenceBreakdown': {
                    'dataFrequency': '0% (no history)',
                    'transactionCount': '0% (no transactions)',
                    'expenseRatio': '0% (no data)',
                    'incomeConstraint': '100% (provided)' if income > 0 else '20% (not provided)'
                },
                'predictionMethod': 'no data available'
            }
        }

    # FÁZE 5.2C: Analyze real features to inform deterministic computation
    category_distribution = FeatureAnalyzer.analyze_category_distribution(transactions)
    amount_patterns = FeatureAnalyzer.analyze_amount_patterns(transactions)
    temporal_pattern = FeatureAnalyzer.analyze_temporal_pattern(transactions)
    feature_impact = FeatureAnalyzer.calculate_feature_impact(transactions, category_distribution, amount_patterns)

    # FÁZE 5.2D: Track feature usage and identify impact drivers
    feature_usage = FeatureAnalyzer.track_feature_usage(transactions, income)
    impact_drivers = FeatureAnalyzer.identify_impact_drivers(category_distribution, amount_patterns, temporal_pattern)

    # Group transactions by category (for backward compatibility)
    category_totals = {}
    category_counts = {}
    monthly_totals = {}

    for tx in transactions:
        category = str(tx.get('category', 'other')).strip().lower()
        amount = float(tx.get('amount', 0))
        date_str = str(tx.get('date', '')).strip()

        # Track by category
        if category not in category_totals:
            category_totals[category] = 0
            category_counts[category] = 0
        category_totals[category] += amount
        category_counts[category] += 1

        # Track by month for trend analysis
        if date_str and len(date_str) >= 7:  # YYYY-MM format
            month_key = date_str[:7]
            if month_key not in monthly_totals:
                monthly_totals[month_key] = 0
            monthly_totals[month_key] += amount

    total_expense = sum(category_totals.values())
    num_transactions = len(transactions)

    # Calculate weighted prediction
    if monthly_totals:
        # Sort months chronologically
        sorted_months = sorted(monthly_totals.keys())
        num_months = len(sorted_months)

        # Use recent months more heavily (3-month window if available)
        if num_months >= 3:
            recent_months = sorted_months[-3:]
            recent_avg = sum(monthly_totals[m] for m in recent_months) / len(recent_months)
            overall_avg = total_expense / num_months
            predicted_expense = (recent_avg * 0.6) + (overall_avg * 0.4)
        elif num_months > 0:
            predicted_expense = total_expense / num_months
        else:
            predicted_expense = total_expense

        # Confidence based on 4 rule-based factors:
        # 1. Data frequency (30%): more months = more reliable trend
        # 2. Transaction count (30%): more data points = more reliable
        # 3. Expense ratio (20%): good if expenses < income
        # 4. Income constraint (20%): provided or not

        months_score = min(1.0, num_months / 12)  # Full score at 12 months
        txns_score = min(1.0, num_transactions / 50)  # Full score at 50+ txns
        expense_ratio = min(1.0, predicted_expense / (income or 1))  # Good if < income
        expense_ratio_score = (1 - abs(1 - expense_ratio)) * 0.2
        income_score = 1.0 if income > 0 else 0.2

        # Weighted confidence calculation (4 factors)
        confidence = (months_score * 0.3 + txns_score * 0.3 +
                     expense_ratio_score + income_score * 0.2)
        confidence = max(0.1, min(0.99, confidence))  # Clamp 0.1-0.99

        # Store confidence factors for debugging
        confidence_factors = {
            'dataFrequency': round(months_score, 2),
            'transactionCount': round(txns_score, 2),
            'expenseRatio': round(expense_ratio_score, 2),
            'incomeConstraint': round(income_score, 2)
        }
    else:
        # No monthly data, use simple average
        predicted_expense = total_expense
        txns_score = min(1.0, num_transactions / 50)
        confidence = min(0.95, 0.4 + (num_transactions * 0.01))

        # Confidence factors for no-monthly-data case
        confidence_factors = {
            'dataFrequency': 0.0,
            'transactionCount': round(txns_score, 2),
            'expenseRatio': 0.0,
            'incomeConstraint': 1.0 if income > 0 else 0.2
        }

    # Build response with normalized categories
    response_categories = {}
    if total_expense > 0:
        # Distribute predicted expense proportionally by historical category ratios
        for category, hist_amount in category_totals.items():
            ratio = hist_amount / total_expense
            predicted_category = predicted_expense * ratio
            response_categories[category] = round(predicted_category, 2)
    else:
        response_categories = {}

    # Calculate expense-to-income ratio for debugging
    expense_to_income_ratio = "N/A"
    if income > 0:
        ratio = total_expense / income
        expense_to_income_ratio = f"{ratio:.1f}x"

    # Debug information (FÁZE 5.2C: enhanced with real feature insights)
    debug_info = {
        'inputSummary': {
            'transactions': num_transactions,
            'monthsOfHistory': len(monthly_totals) if monthly_totals else 0,
            'totalHistoricalExpense': round(total_expense, 2),
            'income': round(income, 2) if income > 0 else None,
            'expenseToIncomeRatio': expense_to_income_ratio
        },
        'confidenceBreakdown': {
            'dataFrequency': f"{round(months_score * 100, 0):.0f}% ({len(sorted_months) if monthly_totals else 0} months)" if monthly_totals else "0% (no history)",
            'transactionCount': f"{round(txns_score * 100, 0):.0f}% ({num_transactions} txns)" if monthly_totals else f"{round(txns_score * 100, 0):.0f}% ({num_transactions} txns)",
            'expenseRatio': f"{round(expense_ratio_score * 100, 0):.0f}% (expense:income = {expense_to_income_ratio})",
            'incomeConstraint': f"{round(income_score * 100, 0):.0f}% ('provided' if income > 0 else 'not provided')"
        },
        'predictionMethod': "weighted recent (60%) + overall (40%) average" if monthly_totals and len(sorted_months) >= 1 else "sum of transactions",
        # FÁZE 5.2C: Feature-based insights (real data, not placeholders)
        'featureAnalysis': {
            'categoryDistribution': category_distribution,
            'amountPatterns': amount_patterns,
            'temporalPattern': temporal_pattern,
            'featureImpact': feature_impact,
        },
        # FÁZE 5.2D: Feature usage tracking and impact drivers
        'featureUsage': {
            'usedFeatures': feature_usage.get('usedFeatures', []),
            'missingFeatures': feature_usage.get('missingFeatures', []),
            'featureCompleteness': feature_usage.get('featureCompleteness', {}),
            'incomeProvided': feature_usage.get('incomeProvided', False),
        },
        'impactDrivers': {
            'topDrivers': impact_drivers.get('topDrivers', []),
            'summary': impact_drivers.get('summary', ''),
        }
    }

    prediction = {
        'period': current_period,
        'totalPredictedExpense': round(predicted_expense, 2),
        'confidence': round(confidence, 2),
        'confidenceFactors': confidence_factors,
        'categories': response_categories,
        'dataPoints': num_transactions,
        'pipelineLevel': pipeline_level,
        '_debug': debug_info  # Internal debug info
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
    FÁZE 5.0C: Main ML prediction endpoint with input parsing, validation, and response
    Receives request from Node/Firebase, parses, validates, processes, returns valid response

    Processing Pipeline:
    1. Get and validate JSON
    2. Validate request contract (type checking, semantic validation)
    3. Parse and normalize input
    4. Generate deterministic baseline prediction
    5. Build response following contract
    6. Validate response contract
    7. Return response with metadata

    Prediction Logic (Deterministic - No ML Model Yet):
    - Groups transactions by category
    - Analyzes monthly trends (3-month window preferred)
    - Calculates weighted prediction: (recent_avg * 0.6) + (overall_avg * 0.4)
    - Confidence score based on: data frequency (30%), transaction count (30%),
      expense ratio (20%), income constraint (20%)
    - Distributes predicted amount proportionally by historical category breakdown

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
            # FÁZE 5.1F: Classify error type
            error_type = 'INVALID_REQUEST'
            if 'Missing required field' in error_msg:
                error_type = 'MISSING_REQUIRED_FIELD'
            elif 'must be one of' in error_msg:
                error_type = 'INVALID_ENUM_VALUE'
            elif 'must be' in error_msg or 'cannot be' in error_msg:
                error_type = 'INVALID_INPUT'

            logger.error({
                'event': '[ERROR] Deterministic computation failed',
                'uid': data.get('uid'),
                'errorType': error_type,
                'reason': error_msg
            })

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
            # FÁZE 5.1F: Log parse error
            logger.error({
                'event': '[ERROR] Deterministic computation failed',
                'uid': data.get('uid'),
                'errorType': 'PARSE_ERROR',
                'reason': str(parse_err)
            })

            return jsonify({
                'status': 'failed',
                'error': f'Input parsing error: {str(parse_err)}',
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # FÁZE 5.2F: Validate dataset-specific requirements
        transactions = parsed['transactions']

        # Check 1: Required features
        required_features_valid, required_features_error, error_type_req = DatasetErrorHandler.validate_required_features(transactions)
        if not required_features_valid:
            logger.error(f'Missing required feature: {required_features_error}')
            logger.error({
                'event': '[ERROR] Dataset validation failed',
                'uid': data.get('uid'),
                'errorType': error_type_req,
                'reason': required_features_error
            })
            return jsonify({
                'status': 'failed',
                'error': required_features_error,
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Check 2: Row consistency
        row_consistent, row_error, error_type_row = DatasetErrorHandler.validate_row_consistency(transactions)
        if not row_consistent:
            logger.error(f'Inconsistent dataset row: {row_error}')
            logger.error({
                'event': '[ERROR] Dataset validation failed',
                'uid': data.get('uid'),
                'errorType': error_type_row,
                'reason': row_error
            })
            return jsonify({
                'status': 'failed',
                'error': row_error,
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Check 3: Target state
        target_valid, target_error, error_type_target = DatasetErrorHandler.validate_target_state(transactions)
        if not target_valid:
            logger.error(f'Invalid target state: {target_error}')
            logger.error({
                'event': '[ERROR] Dataset validation failed',
                'uid': data.get('uid'),
                'errorType': error_type_target,
                'reason': target_error
            })
            return jsonify({
                'status': 'failed',
                'error': target_error,
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # FÁZE 5.2B: Validate features and target presence (legacy validation)
        features_valid, features_error = FeatureExtractor.validate_features(transactions)
        if not features_valid:
            logger.error(f'Feature validation failed: {features_error}')
            logger.error({
                'event': '[ERROR] Dataset validation failed',
                'uid': data.get('uid'),
                'errorType': 'INVALID_FEATURES',
                'reason': features_error
            })
            return jsonify({
                'status': 'failed',
                'error': f'Dataset feature validation failed: {features_error}',
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # FÁZE 5.2B: Check target presence (optional warning, not failure)
        target_valid_legacy, target_error_legacy = TargetInfo.validate_target_presence(transactions, parsed['income'])
        if not target_valid_legacy:
            logger.warning(f'Target validation issue: {target_error_legacy}', extra={'uid': data.get('uid')})

        # FÁZE 5.2E: Observability logging - dataset accepted
        logger.info(f"[DATASET-ACCEPTED] uid={parsed['uid']}, rows={len(parsed['transactions'])}, level={parsed['pipelineLevel']}, income_provided={parsed['income'] > 0}")
        logger.info(f"[PREDICT] Processing: uid={parsed['uid']}, level={parsed['pipelineLevel']}, txns={len(parsed['transactions'])}")

        # Extract parsed data
        uid = parsed['uid']
        pipeline_level = parsed['pipelineLevel']
        model_version = parsed['modelVersion']
        transactions = parsed['transactions']
        income = parsed['income']
        debug_mode = parsed['debugMode']

        # Step 4: Generate prediction (using parsed data)
        try:
            prediction = calculate_baseline_prediction(transactions, income, pipeline_level)
            logger.debug(f"Prediction generated: {prediction}")

            # FÁZE 5.2E: Observability logging - computation succeeded
            logger.info(f"[COMPUTATION-SUCCEEDED] uid={uid}, predicted_expense={prediction['totalPredictedExpense']:.2f}, categories={len(prediction['categories'])}")

        except Exception as pred_err:
            logger.error(f'Prediction calculation failed: {str(pred_err)}')
            # FÁZE 5.1F: Log computation error
            logger.error({
                'event': '[ERROR] Deterministic computation failed',
                'uid': uid,
                'errorType': 'COMPUTATION_FAILED',
                'reason': f'Unexpected error during prediction calculation: {str(pred_err)}'
            })
            # FÁZE 5.2E: Observability logging - computation failed
            logger.error(f"[COMPUTATION-FAILED] uid={uid}, error={str(pred_err)}")

            return jsonify({
                'status': 'failed',
                'error': f'Prediction calculation failed: {str(pred_err)}',
                'uid': uid,
                'debugMetadata': {'processingTimeMs': int((time.time() - start_time) * 1000)}
            }), 500

        # Step 5: Build response following contract
        response = ResponseContract.build(data, [prediction])

        # Step 6: Validate response contract
        is_valid, validation_error = ResponseContract.validate(response)
        if not is_valid:
            logger.error(f'Response validation failed: {validation_error}')
            return jsonify({
                'status': 'failed',
                'error': f'Internal error: {validation_error}',
                'uid': uid,
                'debugMetadata': {'processingTimeMs': int((time.time() - start_time) * 1000)}
            }), 500

        # Step 7: Add processing time and parsing metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        response['debugMetadata']['processingTimeMs'] = processing_time_ms
        response['debugMetadata']['parsed'] = RequestParser.get_summary(parsed)

        # FÁZE 5.1C: Add input and confidence explanation
        if '_debug' in prediction:
            debug_data = prediction['_debug']
            response['debugMetadata']['inputs'] = debug_data['inputSummary']
            response['debugMetadata']['confidenceExplained'] = debug_data['confidenceBreakdown']
            response['debugMetadata']['calculationMethod'] = debug_data['predictionMethod']

            # Remove _debug from prediction objects (internal only)
            for pred in response['predictions']:
                if '_debug' in pred:
                    del pred['_debug']

        # FÁZE 5.2B: Add dataset metadata for training readiness
        dataset_meta = DatasetMetadata.generate(transactions, parsed['income'])
        response['debugMetadata']['datasetMetadata'] = dataset_meta
        logger.info(f"[DATASET] Features validated: uid={uid}, rows={dataset_meta['datasetSize']['totalRows']}, categories={dataset_meta['datasetSize']['uniqueCategories']}, months={dataset_meta['targets']['monthsAvailable']}")

        # FÁZE 5.2C: Add feature-based analysis to response
        if '_debug' in prediction and 'featureAnalysis' in prediction['_debug']:
            response['debugMetadata']['featureAnalysis'] = prediction['_debug']['featureAnalysis']
            feature_analysis = prediction['_debug']['featureAnalysis']
            top_category = feature_analysis['featureImpact'].get('topImpactCategory', 'N/A')
            top_impact = feature_analysis['featureImpact'].get('topCategoryImpact', 0)
            logger.info(f"[FEATURES] Analyzed: uid={uid}, top_category={top_category}, impact={top_impact}%, diversity={feature_analysis['featureImpact'].get('categoryDiversity', 'N/A')}")

        # FÁZE 5.2D: Add feature usage and impact drivers to response
        if '_debug' in prediction:
            debug_data = prediction['_debug']
            if 'featureUsage' in debug_data:
                response['debugMetadata']['featureUsage'] = debug_data['featureUsage']
            if 'impactDrivers' in debug_data:
                response['debugMetadata']['impactDrivers'] = debug_data['impactDrivers']

                # Log impact drivers
                drivers_summary = debug_data['impactDrivers'].get('summary', '')
                used_features = debug_data['featureUsage'].get('usedFeatures', [])
                missing_features = debug_data['featureUsage'].get('missingFeatures', [])
                logger.info(f"[FEATURE-USAGE] uid={uid}, used={','.join(used_features) or 'none'}, missing={','.join(missing_features) or 'none'}")
                if drivers_summary:
                    logger.info(f"[IMPACT-DRIVERS] uid={uid}, drivers={drivers_summary}")

        # FÁZE 5.2E: Observability logging - confidence assigned
        confidence_score = prediction['confidence']
        logger.info(f"[CONFIDENCE-ASSIGNED] uid={uid}, score={confidence_score}, method=4-factor-weighted")

        # FÁZE 5.1E: Observability logging for deterministic result
        logger.info(f"[RESULT] Generated: uid={uid}, expense={prediction['totalPredictedExpense']}, confidence={prediction['confidence']}, method=deterministic")
        logger.info(f"[CONFIDENCE] Assigned: uid={uid}, score={prediction['confidence']}, factors=4-factor-weighted")
        if '_debug' in prediction:
          logger.info(f"[METADATA] Attached: uid={uid}, inputs={len(prediction['_debug']['inputSummary'])}, factors={len(prediction['_debug']['confidenceBreakdown'])}")

        # FÁZE 5.2E: Observability logging - flow summary
        logger.info(f"[DATASET-BACKED-FLOW] uid={uid}, rows={len(transactions)}, computation=success, confidence={prediction['confidence']}, time={processing_time_ms}ms")

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


@app.route('/dataset-info', methods=['POST'])
def dataset_info():
    """
    FÁZE 5.2B: Dataset analysis endpoint
    Validates features and target presence without making predictions

    Request: Same as /predict
    Response: Dataset metadata including feature coverage, target presence, training readiness
    """
    import time
    start_time = time.time()
    data = None

    try:
        # Get and validate JSON
        data = request.get_json()

        if data is None:
            return jsonify({
                'status': 'failed',
                'error': 'Request must be JSON',
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Validate request contract
        is_valid, error_msg = RequestContract.validate(data)
        if not is_valid:
            logger.warning(f'Dataset info request validation failed: {error_msg}')
            return jsonify({
                'status': 'failed',
                'error': error_msg,
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Parse and normalize
        try:
            parsed = RequestParser.parse(data)
        except ValueError as e:
            logger.error(f'Dataset info parsing failed: {str(e)}')
            return jsonify({
                'status': 'failed',
                'error': f'Parsing failed: {str(e)}',
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        transactions = parsed['transactions']
        uid = parsed['uid']

        # FÁZE 5.2E: Observability logging - dataset accepted for analysis
        logger.info(f"[DATASET-ACCEPTED] uid={uid}, rows={len(transactions)}, level={parsed['pipelineLevel']}, endpoint=dataset-info")

        # FÁZE 5.2F: Dataset error handling for analysis endpoint
        # Check 1: Required features
        required_features_valid, required_features_error, error_type_req = DatasetErrorHandler.validate_required_features(transactions)
        if not required_features_valid:
            logger.error(f'Missing required feature (analysis): {required_features_error}')
            logger.error({
                'event': '[ERROR] Dataset validation failed',
                'uid': uid,
                'errorType': error_type_req,
                'reason': required_features_error
            })
            logger.error(f"[FEATURE-VALIDATION-FAILED] uid={uid}, error={required_features_error}")
            return jsonify({
                'status': 'failed',
                'error': required_features_error,
                'uid': uid,
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Check 2: Row consistency
        row_consistent, row_error, error_type_row = DatasetErrorHandler.validate_row_consistency(transactions)
        if not row_consistent:
            logger.error(f'Inconsistent row (analysis): {row_error}')
            logger.error({
                'event': '[ERROR] Dataset validation failed',
                'uid': uid,
                'errorType': error_type_row,
                'reason': row_error
            })
            logger.error(f"[FEATURE-VALIDATION-FAILED] uid={uid}, error={row_error}")
            return jsonify({
                'status': 'failed',
                'error': row_error,
                'uid': uid,
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Check 3: Target state
        target_valid_check, target_error_check, error_type_target = DatasetErrorHandler.validate_target_state(transactions)
        if not target_valid_check:
            logger.error(f'Invalid target state (analysis): {target_error_check}')
            logger.error({
                'event': '[ERROR] Dataset validation failed',
                'uid': uid,
                'errorType': error_type_target,
                'reason': target_error_check
            })
            logger.error(f"[FEATURE-VALIDATION-FAILED] uid={uid}, error={target_error_check}")
            return jsonify({
                'status': 'failed',
                'error': target_error_check,
                'uid': uid,
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Validate features (legacy)
        features_valid, features_error = FeatureExtractor.validate_features(transactions)
        if not features_valid:
            logger.error(f'Dataset info feature validation failed: {features_error}')
            # FÁZE 5.2E: Observability logging - feature validation failed
            logger.error(f"[FEATURE-VALIDATION-FAILED] uid={uid}, error={features_error}")
            return jsonify({
                'status': 'failed',
                'error': f'Feature validation failed: {features_error}',
                'uid': uid,
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # FÁZE 5.2E: Observability logging - feature validation passed
        logger.info(f"[FEATURE-VALIDATION-PASSED] uid={uid}, features=all-valid")

        # Analyze dataset
        feature_coverage = FeatureExtractor.analyze_feature_coverage(transactions)
        target_quality = TargetInfo.analyze_target_quality(transactions)
        dataset_meta = DatasetMetadata.generate(transactions, parsed['income'])

        # Check target presence
        target_valid, target_error = TargetInfo.validate_target_presence(transactions, parsed['income'])

        processing_time_ms = int((time.time() - start_time) * 1000)

        response = {
            'status': 'success',
            'uid': uid,
            'pipelineLevel': parsed['pipelineLevel'],
            'processedAt': datetime.utcnow().isoformat() + 'Z',
            'features': {
                'validation': 'passed',
                'coverage': feature_coverage['featurePresence'],
                'categories': feature_coverage['uniqueCategories'],
                'amountRange': feature_coverage['amountRange'],
            },
            'targets': {
                'validation': 'passed' if target_valid else 'warning',
                'validationMessage': '' if target_valid else target_error,
                'monthlyTargets': target_quality['targetPresence'],
                'monthsAvailable': target_quality['monthsAvailable'],
                'timeSpan': target_quality.get('timeSpan', 'N/A'),
                'targetRange': target_quality.get('targetRange'),
            },
            'datasetMetadata': dataset_meta,
            'readyForTraining': dataset_meta['summary']['readyForTraining'],
            'recommendation': dataset_meta['summary']['recommendation'],
            'debugMetadata': {
                'processingTimeMs': processing_time_ms,
                'totalRows': len(transactions),
                'dataSource': 'Firestore (real user transactions)',
            }
        }

        # FÁZE 5.2E: Observability logging - dataset analysis summary
        logger.info(f"[DATASET-ANALYSIS-SUCCEEDED] uid={uid}, rows={len(transactions)}, features_ok={features_valid}, targets_ok={target_valid}")
        logger.info(f"[DATASET-BACKED-FLOW] uid={uid}, rows={len(transactions)}, analysis=success, ready_for_training={dataset_meta['summary']['readyForTraining']}, time={processing_time_ms}ms")

        logger.info(f"[DATASET-INFO] Analysis: uid={uid}, rows={len(transactions)}, features_ok={features_valid}, target_ok={target_valid}, ready={dataset_meta['summary']['readyForTraining']}")

        return jsonify(response), 200

    except Exception as e:
        logger.error(f'Dataset info error: {str(e)}')
        processing_time_ms = int((time.time() - start_time) * 1000)
        return jsonify({
            'status': 'failed',
            'error': str(e),
            'uid': data.get('uid') if data else None,
            'debugMetadata': {'processingTimeMs': processing_time_ms}
        }), 500


@app.route('/evaluate', methods=['POST'])
def evaluate():
    """
    FÁZE 5.3A: Offline evaluation endpoint
    Evaluates deterministic predictions against actual data using train/test split

    Request: Same as /predict
    Response: Evaluation metrics and report
    """
    import time
    start_time = time.time()
    data = None

    try:
        # Get and validate JSON
        data = request.get_json()

        if data is None:
            return jsonify({
                'status': 'failed',
                'error': 'Request must be JSON',
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Validate request contract
        is_valid, error_msg = RequestContract.validate(data)
        if not is_valid:
            logger.warning(f'Evaluate request validation failed: {error_msg}')
            return jsonify({
                'status': 'failed',
                'error': error_msg,
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # Parse and normalize
        try:
            parsed = RequestParser.parse(data)
        except ValueError as e:
            logger.error(f'Evaluate parsing failed: {str(e)}')
            return jsonify({
                'status': 'failed',
                'error': f'Parsing failed: {str(e)}',
                'uid': data.get('uid'),
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        transactions = parsed['transactions']
        uid = parsed['uid']
        income = parsed['income']

        # FÁZE 5.3A: Validation
        required_features_valid, required_features_error, _ = DatasetErrorHandler.validate_required_features(transactions)
        if not required_features_valid:
            return jsonify({
                'status': 'failed',
                'error': required_features_error,
                'uid': uid,
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        # FÁZE 5.3A: Split dataset
        train_txs, test_txs, test_months = DatasetSplitter.split_by_date(transactions, test_ratio=0.2)

        if not test_txs or not test_months:
            return jsonify({
                'status': 'failed',
                'error': 'Insufficient data for evaluation (need at least 2 months)',
                'uid': uid,
                'debugMetadata': {'processingTimeMs': 0}
            }), 400

        logger.info(f"[EVALUATE-STARTED] uid={uid}, total_rows={len(transactions)}, train_rows={len(train_txs)}, test_rows={len(test_txs)}, test_months={len(test_months)}")

        # FÁZE 5.3A: Generate predictions
        train_prediction = calculate_baseline_prediction(train_txs, income, parsed['pipelineLevel'])
        test_prediction = calculate_baseline_prediction(test_txs, income, parsed['pipelineLevel'])

        # FÁZE 5.3A: Get actual test values
        test_actuals = DatasetSplitter.get_test_month_totals(transactions, test_months)

        # Create prediction dict for test period (use test_prediction's expense distributed across months)
        test_predictions_by_month = {}
        if test_months:
            # Distribute predicted expense equally across test months (simple approach)
            monthly_prediction = test_prediction['totalPredictedExpense'] / len(test_months)
            for month in test_months:
                test_predictions_by_month[month] = round(monthly_prediction, 2)

        # FÁZE 5.3A: Calculate metrics
        pred_list = [test_predictions_by_month.get(m, 0) for m in sorted(test_months)]
        actual_list = [test_actuals.get(m, 0) for m in sorted(test_months)]

        mae = EvaluationMetrics.calculate_mae(pred_list, actual_list)
        rmse = EvaluationMetrics.calculate_rmse(pred_list, actual_list)
        mape = EvaluationMetrics.calculate_mape(pred_list, actual_list)
        r_squared = EvaluationMetrics.calculate_r_squared(pred_list, actual_list)

        metrics = {
            'mae': round(mae, 2),
            'rmse': round(rmse, 2),
            'mape': round(mape, 2),
            'r_squared': round(r_squared, 2),
        }

        processing_time_ms = int((time.time() - start_time) * 1000)

        # FÁZE 5.3A: Generate report
        report = EvaluationReporter.generate_report(test_predictions_by_month, test_actuals, metrics)

        response = {
            'status': 'success',
            'uid': uid,
            'pipelineLevel': parsed['pipelineLevel'],
            'processedAt': datetime.utcnow().isoformat() + 'Z',
            'evaluation': {
                'dataset': {
                    'total_rows': len(transactions),
                    'train_rows': len(train_txs),
                    'test_rows': len(test_txs),
                    'test_months': len(test_months),
                },
                'train_metrics': {
                    'predicted_expense': round(train_prediction['totalPredictedExpense'], 2),
                    'confidence': round(train_prediction['confidence'], 2),
                },
                'test_metrics': metrics,
                'predictions_vs_actuals': {
                    'predictions': test_predictions_by_month,
                    'actuals': test_actuals,
                },
                'summary': report['summary'],
            },
            'debugMetadata': {
                'processingTimeMs': processing_time_ms,
                'evaluation_type': 'offline_deterministic_baseline',
                'train_test_split': '80/20',
                'metric_explanations': {
                    'mae': 'Mean Absolute Error (dollars)',
                    'rmse': 'Root Mean Squared Error (dollars)',
                    'mape': 'Mean Absolute Percentage Error (%)',
                    'r_squared': 'Coefficient of Determination (0-1)',
                }
            }
        }

        logger.info(f"[EVALUATE-SUCCEEDED] uid={uid}, mae={mae:.2f}, rmse={rmse:.2f}, mape={mape:.1f}%, r_squared={r_squared:.3f}")

        return jsonify(response), 200

    except Exception as e:
        logger.error(f'Evaluate error: {str(e)}')
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
            '/predict',
            '/dataset-info',
            '/evaluate'
        ],
        'capabilities': [
            'baseline-prediction',
            'dataset-validation',
            'feature-analysis',
            'target-detection',
            'offline-evaluation'
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
    logger.info('  GET  /health        - Health check')
    logger.info('  GET  /status        - Runtime status')
    logger.info('  POST /predict       - ML prediction with feature validation')
    logger.info('  POST /dataset-info  - Dataset analysis (FÁZE 5.2B)')
    logger.info('  POST /evaluate      - Offline evaluation (FÁZE 5.3A)')

    app.run(
        host='127.0.0.1',
        port=PORT,
        debug=DEBUG,
        threaded=True
    )
