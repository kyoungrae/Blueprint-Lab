import React, { useState } from 'react';
import { X, Plus, Trash2, Key, Link } from 'lucide-react';
import type { Entity, Attribute } from '../types/erd';

interface EntityEditModalProps {
    entity: Entity;
    onSave: (updatedEntity: Entity) => void;
    onDelete: () => void;
    onClose: () => void;
}

const EntityEditModal: React.FC<EntityEditModalProps> = ({
    entity,
    onSave,
    onDelete,
    onClose,
}) => {
    const [name, setName] = useState(entity.name);
    const [attributes, setAttributes] = useState<Attribute[]>(entity.attributes);

    const handleAddAttribute = () => {
        const newAttr: Attribute = {
            id: `attr_${Date.now()}`,
            name: 'new_column',
            type: 'VARCHAR(255)',
            isPK: false,
            isFK: false,
            isNullable: true,
        };
        setAttributes([...attributes, newAttr]);
    };

    const handleUpdateAttribute = (id: string, updates: Partial<Attribute>) => {
        setAttributes(
            attributes.map((attr) =>
                attr.id === id ? { ...attr, ...updates } : attr
            )
        );
    };

    const handleDeleteAttribute = (id: string) => {
        setAttributes(attributes.filter((attr) => attr.id !== id));
    };

    const handleSave = () => {
        onSave({
            ...entity,
            name,
            attributes,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-2xl font-bold text-gray-800">Edit Entity</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Entity Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Entity Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            placeholder="Enter entity name"
                        />
                    </div>

                    {/* Attributes */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="block text-sm font-medium text-gray-700">
                                Attributes
                            </label>
                            <button
                                onClick={handleAddAttribute}
                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                            >
                                <Plus size={16} />
                                Add Attribute
                            </button>
                        </div>

                        <div className="space-y-2">
                            {attributes.map((attr) => (
                                <div
                                    key={attr.id}
                                    className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200"
                                >
                                    {/* Attribute Name */}
                                    <input
                                        type="text"
                                        value={attr.name}
                                        onChange={(e) =>
                                            handleUpdateAttribute(attr.id, { name: e.target.value })
                                        }
                                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                                        placeholder="Column name"
                                    />

                                    {/* Data Type */}
                                    <select
                                        value={attr.type}
                                        onChange={(e) =>
                                            handleUpdateAttribute(attr.id, { type: e.target.value })
                                        }
                                        className="px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                                    >
                                        <option value="INT">INT</option>
                                        <option value="BIGINT">BIGINT</option>
                                        <option value="VARCHAR(255)">VARCHAR(255)</option>
                                        <option value="TEXT">TEXT</option>
                                        <option value="BOOLEAN">BOOLEAN</option>
                                        <option value="DATE">DATE</option>
                                        <option value="DATETIME">DATETIME</option>
                                        <option value="TIMESTAMP">TIMESTAMP</option>
                                        <option value="DECIMAL(10,2)">DECIMAL(10,2)</option>
                                        <option value="FLOAT">FLOAT</option>
                                    </select>

                                    {/* PK Checkbox */}
                                    <label className="flex items-center gap-1 px-2 py-1 bg-yellow-100 rounded cursor-pointer hover:bg-yellow-200 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={attr.isPK}
                                            onChange={(e) =>
                                                handleUpdateAttribute(attr.id, {
                                                    isPK: e.target.checked,
                                                })
                                            }
                                            className="w-4 h-4"
                                        />
                                        <Key size={14} className="text-yellow-600" />
                                        <span className="text-xs font-medium text-yellow-700">
                                            PK
                                        </span>
                                    </label>

                                    {/* FK Checkbox */}
                                    <label className="flex items-center gap-1 px-2 py-1 bg-purple-100 rounded cursor-pointer hover:bg-purple-200 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={attr.isFK}
                                            onChange={(e) =>
                                                handleUpdateAttribute(attr.id, {
                                                    isFK: e.target.checked,
                                                })
                                            }
                                            className="w-4 h-4"
                                        />
                                        <Link size={14} className="text-purple-600" />
                                        <span className="text-xs font-medium text-purple-700">
                                            FK
                                        </span>
                                    </label>

                                    {/* Nullable Checkbox */}
                                    <label className="flex items-center gap-1 px-2 py-1 bg-gray-200 rounded cursor-pointer hover:bg-gray-300 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={attr.isNullable ?? true}
                                            onChange={(e) =>
                                                handleUpdateAttribute(attr.id, {
                                                    isNullable: e.target.checked,
                                                })
                                            }
                                            className="w-4 h-4"
                                        />
                                        <span className="text-xs font-medium text-gray-700">
                                            NULL
                                        </span>
                                    </label>

                                    {/* Delete Button */}
                                    <button
                                        onClick={() => handleDeleteAttribute(attr.id)}
                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                        title="Delete attribute"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}

                            {attributes.length === 0 && (
                                <div className="text-center py-8 text-gray-400">
                                    No attributes yet. Click "Add Attribute" to create one.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={onDelete}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                    >
                        Delete Entity
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EntityEditModal;
